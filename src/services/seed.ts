import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Session } from 'neo4j-driver';
import { ImageSeedTransformService } from './image.seed.transform.ts';
import { Neo4jService } from './neo4j.service.ts';
import { getImageSignatureFromImageBuffer } from './image.signature.ts';

type CocoImage = {
  id: number;
  file_name: string;
  width: number;
  height: number;
  license?: number;
  date_captured?: string;
};

type CocoAnnotation = {
  id: number;
  image_id: number;
  category_id: number;
  bbox?: number[];
  area?: number;
  iscrowd?: number;
  segmentation?: unknown;
};

type CocoCategory = {
  id: number;
  name: string;
  supercategory?: string;
};

type CocoFile = {
  images: CocoImage[];
  annotations: CocoAnnotation[];
  categories: CocoCategory[];
};

type DcisEntry = {
  id: number;
  key?: number;
  file_name?: string;
  width?: number;
  height?: number;
  mpp?: number;
  global_x?: number;
  global_y?: number;
};

type LocalTileEntry = DcisEntry & {
  local_patient_folder: string;
  local_relative_file_name: string | null;
};

const COCO_PATH = path.resolve(process.cwd(), 'data/annotations/COCO_annotations.json');
const DCIS_ROOT = path.resolve(process.cwd(), 'data/annotations/DCIS');
const IMAGES_ROOT = path.resolve(process.cwd(), 'data/images');
const IMAGES_RAW_ROOT = path.resolve(process.cwd(), 'data/imagesRaw');
const HELD_OUT_LOCAL_PATIENT_FOLDERS = new Set(['Patient_001']);

const BATCH_SIZE = Number(process.env.NEO4J_SEED_BATCH_SIZE ?? 300);
const CLEAR_EXISTING = (process.env.NEO4J_SEED_CLEAR ?? 'false').toLowerCase() === 'true';
const imageSeedTransformService = new ImageSeedTransformService();

const readJsonFile = <T,>(filePath: string): T => {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
};

const listManifestPaths = (rootPath: string): string[] => {
  const manifests: string[] = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath || !existsSync(currentPath)) {
      continue;
    }

    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile() && /^DCIS\.Patient_\d+\.2\.json$/i.test(entry.name)) {
        manifests.push(entryPath);
      }
    }
  }

  return manifests.sort((left, right) => left.localeCompare(right));
};

const loadLocalTileEntries = (): LocalTileEntry[] => {
  const manifestPaths = listManifestPaths(DCIS_ROOT);

  if (manifestPaths.length === 0) {
    throw new Error(`Nenhum manifesto local foi encontrado em ${DCIS_ROOT}.`);
  }

  return manifestPaths.flatMap((manifestPath) => {
    const patientFolder = path.basename(path.dirname(manifestPath));
    const localPrefix = path.posix.join('DCIS', patientFolder);

    return readJsonFile<DcisEntry[]>(manifestPath).map((entry) => ({
      ...entry,
      local_patient_folder: patientFolder,
      local_relative_file_name: entry.file_name
        ? path.posix.join(localPrefix, imageSeedTransformService.normalizeFileName(entry.file_name))
        : null,
    }));
  });
};

const resolveLocalImageBinaryPath = (localRelativeFileName: string | null): string | null => {
  if (!localRelativeFileName) {
    return null;
  }

  const candidateRaw = path.resolve(IMAGES_RAW_ROOT, localRelativeFileName);
  if (existsSync(candidateRaw)) {
    return candidateRaw;
  }

  const normalizedFileName = localRelativeFileName;
  const ext = path.extname(normalizedFileName) || '.png';
  const base = path.basename(normalizedFileName, ext);
  const fallbackName = `${base}_rgb_labels${ext}`;
  const candidateByFallback = path.resolve(IMAGES_ROOT, path.dirname(normalizedFileName), fallbackName);

  if (existsSync(candidateByFallback)) {
    return candidateByFallback;
  }

  return null;
};

const createConstraints = async (neo4jService: Neo4jService, session: Session) => {
  await neo4jService.executeWrite(session, 'CREATE CONSTRAINT image_id IF NOT EXISTS FOR (n:Image) REQUIRE n.id IS UNIQUE');
  await neo4jService.executeWrite(session, 'CREATE CONSTRAINT annotation_id IF NOT EXISTS FOR (n:Annotation) REQUIRE n.id IS UNIQUE');
  await neo4jService.executeWrite(session, 'CREATE CONSTRAINT category_id IF NOT EXISTS FOR (n:Category) REQUIRE n.id IS UNIQUE');
  await neo4jService.executeWrite(session, 'CREATE CONSTRAINT tile_id IF NOT EXISTS FOR (n:Tile) REQUIRE n.id IS UNIQUE');
};

const main = async () => {
  const coco = readJsonFile<CocoFile>(COCO_PATH);
  const allLocalTileEntries = loadLocalTileEntries();
  const heldOutTileEntries = allLocalTileEntries.filter((entry) => HELD_OUT_LOCAL_PATIENT_FOLDERS.has(entry.local_patient_folder));
  const dcis = allLocalTileEntries.filter((entry) => !HELD_OUT_LOCAL_PATIENT_FOLDERS.has(entry.local_patient_folder));
  const heldOutImageIds = new Set(heldOutTileEntries.map((entry) => entry.id));
  const seededImages = coco.images.filter((image) => !heldOutImageIds.has(image.id));
  const seededAnnotations = coco.annotations.filter((annotation) => !heldOutImageIds.has(annotation.image_id));
  const neo4jService = new Neo4jService();
  const localTileByImageId = new Map(dcis.map((entry) => [entry.id, entry]));

  await neo4jService.verifyConnectivity();

  const session = neo4jService.createSession();

  try {
    if (CLEAR_EXISTING) {
      await neo4jService.executeWrite(session, 'MATCH (n) DETACH DELETE n');
      console.log('[seed] Banco limpo (NEO4J_SEED_CLEAR=true).');
    }

    console.log(`[seed] Holdout local: ${Array.from(HELD_OUT_LOCAL_PATIENT_FOLDERS).join(', ')} | imagens excluidas=${heldOutImageIds.size}`);

    await createConstraints(neo4jService, session);

    const categoriesRows = coco.categories.map((category) => ({
      id: category.id,
      name: category.name,
      supercategory: category.supercategory ?? null,
      raw_json: JSON.stringify(category),
    }));

    await neo4jService.runBatched(
      session,
      `
      UNWIND $rows AS row
      MERGE (c:Category {id: row.id})
      SET c.name = row.name,
          c.supercategory = row.supercategory,
          c.raw_json = row.raw_json
      `,
      categoriesRows,
      { batchSize: BATCH_SIZE, label: 'categorias' },
    );

    const imageRows = await Promise.all(seededImages.map(async (image) => {
      const row = imageSeedTransformService.toSeedImageRow(image);
      const localTileEntry = localTileByImageId.get(row.id);
      const imageBinaryPath = resolveLocalImageBinaryPath(localTileEntry?.local_relative_file_name ?? null);

      if (!imageBinaryPath) {
        return {
          ...row,
          sig_mean: null,
          sig_std: null,
          sig_len: null,
          sig_m0: null,
          sig_m1: null,
          sig_m2: null,
          sig_m3: null,
          sig_m4: null,
          sig_m5: null,
          sig_m6: null,
          sig_m7: null,
        };
      }

      const signature = await getImageSignatureFromImageBuffer(readFileSync(imageBinaryPath));

      return {
        ...row,
        sig_mean: signature.mean,
        sig_std: signature.std,
        sig_len: signature.byteLength,
        sig_m0: signature.bands[0] ?? null,
        sig_m1: signature.bands[1] ?? null,
        sig_m2: signature.bands[2] ?? null,
        sig_m3: signature.bands[3] ?? null,
        sig_m4: signature.bands[4] ?? null,
        sig_m5: signature.bands[5] ?? null,
        sig_m6: signature.bands[6] ?? null,
        sig_m7: signature.bands[7] ?? null,
      };
    }));

    await neo4jService.runBatched(
      session,
      `
      UNWIND $rows AS row
      MERGE (i:Image {id: row.id})
      SET i.file_name = row.file_name,
          i.width = row.width,
          i.height = row.height,
          i.license = row.license,
          i.date_captured = row.date_captured,
          i.sig_mean = row.sig_mean,
          i.sig_std = row.sig_std,
          i.sig_len = row.sig_len,
          i.sig_m0 = row.sig_m0,
          i.sig_m1 = row.sig_m1,
          i.sig_m2 = row.sig_m2,
          i.sig_m3 = row.sig_m3,
          i.sig_m4 = row.sig_m4,
          i.sig_m5 = row.sig_m5,
          i.sig_m6 = row.sig_m6,
          i.sig_m7 = row.sig_m7,
          i.raw_json = row.raw_json
      `,
      imageRows,
      { batchSize: BATCH_SIZE, label: 'imagens' },
    );

    const annotationRows = seededAnnotations.map((annotation) => ({
      id: annotation.id,
      image_id: annotation.image_id,
      category_id: annotation.category_id,
      area: annotation.area ?? null,
      iscrowd: annotation.iscrowd ?? null,
      bbox_json: JSON.stringify(annotation.bbox ?? null),
      segmentation_json: JSON.stringify(annotation.segmentation ?? null),
      raw_json: JSON.stringify(annotation),
    }));

    await neo4jService.runBatched(
      session,
      `
      UNWIND $rows AS row
      MERGE (a:Annotation {id: row.id})
      SET a.image_id = row.image_id,
          a.category_id = row.category_id,
          a.area = row.area,
          a.iscrowd = row.iscrowd,
          a.bbox_json = row.bbox_json,
          a.segmentation_json = row.segmentation_json,
          a.raw_json = row.raw_json
      WITH a, row
      MATCH (i:Image {id: row.image_id})
      MERGE (a)-[:BELONGS_TO_IMAGE]->(i)
      WITH a, row
      MATCH (c:Category {id: row.category_id})
      MERGE (a)-[:HAS_CATEGORY]->(c)
      `,
      annotationRows,
      { batchSize: BATCH_SIZE, label: 'anotacoes' },
    );

    const tileRows = dcis.map((entry) => ({
      id: entry.id,
      key: entry.key ?? null,
      file_name: entry.file_name ? imageSeedTransformService.normalizeFileName(entry.file_name) : null,
      local_patient_folder: entry.local_patient_folder,
      local_relative_file_name: entry.local_relative_file_name,
      width: entry.width ?? null,
      height: entry.height ?? null,
      mpp: entry.mpp ?? null,
      global_x: entry.global_x ?? null,
      global_y: entry.global_y ?? null,
      raw_json: JSON.stringify(entry),
    }));

    await neo4jService.runBatched(
      session,
      `
      UNWIND $rows AS row
      MERGE (t:Tile {id: row.id})
      SET t.key = row.key,
          t.file_name = row.file_name,
          t.local_patient_folder = row.local_patient_folder,
          t.local_relative_file_name = row.local_relative_file_name,
          t.width = row.width,
          t.height = row.height,
          t.mpp = row.mpp,
          t.global_x = row.global_x,
          t.global_y = row.global_y,
          t.raw_json = row.raw_json
      WITH t, row
        MATCH (i:Image {id: row.id})
      MERGE (t)-[:REFERS_TO_IMAGE]->(i)
      `,
      tileRows,
      { batchSize: BATCH_SIZE, label: 'tiles' },
    );

    const countsResult = await neo4jService.executeRead(
      session,
      `
      MATCH (i:Image)
      WITH count(i) AS images
      MATCH (a:Annotation)
      WITH images, count(a) AS annotations
      MATCH (c:Category)
      WITH images, annotations, count(c) AS categories
      MATCH (t:Tile)
      RETURN images, annotations, categories, count(t) AS tiles
      `,
    );

    const stats = countsResult.records[0]?.toObject() ?? {};
    console.log('[seed] Finalizado com sucesso.');
    console.log('[seed] Contagens:', stats);
  } finally {
    await session.close();
    await neo4jService.close();
  }
};

main().catch((error: unknown) => {
  console.error('[seed] Falha ao executar seed no Neo4j.');
  console.error(error);
  process.exit(1);
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Session } from 'neo4j-driver';
import { ImageSeedTransformService } from './image.seed.transform.ts';
import { Neo4jService } from './neo4j.service.ts';

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

const COCO_PATH = path.resolve(process.cwd(), 'data/annotations/COCO_annotations.json');
const DCIS_PATH = path.resolve(process.cwd(), 'data/annotations/DCIS.Patient_001.2.json');

const BATCH_SIZE = Number(process.env.NEO4J_SEED_BATCH_SIZE ?? 300);
const CLEAR_EXISTING = (process.env.NEO4J_SEED_CLEAR ?? 'false').toLowerCase() === 'true';

const readJsonFile = <T,>(filePath: string): T => {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
};

const createConstraints = async (neo4jService: Neo4jService, session: Session) => {
  await neo4jService.executeWrite(session, 'CREATE CONSTRAINT image_id IF NOT EXISTS FOR (n:Image) REQUIRE n.id IS UNIQUE');
  await neo4jService.executeWrite(session, 'CREATE CONSTRAINT annotation_id IF NOT EXISTS FOR (n:Annotation) REQUIRE n.id IS UNIQUE');
  await neo4jService.executeWrite(session, 'CREATE CONSTRAINT category_id IF NOT EXISTS FOR (n:Category) REQUIRE n.id IS UNIQUE');
  await neo4jService.executeWrite(session, 'CREATE CONSTRAINT tile_id IF NOT EXISTS FOR (n:Tile) REQUIRE n.id IS UNIQUE');
};

const main = async () => {
  const coco = readJsonFile<CocoFile>(COCO_PATH);
  const dcis = readJsonFile<DcisEntry[]>(DCIS_PATH);
  const imageSeedTransformService = new ImageSeedTransformService();
  const neo4jService = new Neo4jService();

  await neo4jService.verifyConnectivity();

  const session = neo4jService.createSession();

  try {
    if (CLEAR_EXISTING) {
      await neo4jService.executeWrite(session, 'MATCH (n) DETACH DELETE n');
      console.log('[seed] Banco limpo (NEO4J_SEED_CLEAR=true).');
    }

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

    const imageRows = coco.images.map((image) => imageSeedTransformService.toSeedImageRow(image));

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
          i.raw_json = row.raw_json
      `,
      imageRows,
      { batchSize: BATCH_SIZE, label: 'imagens' },
    );

    const annotationRows = coco.annotations.map((annotation) => ({
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
          t.width = row.width,
          t.height = row.height,
          t.mpp = row.mpp,
          t.global_x = row.global_x,
          t.global_y = row.global_y,
          t.raw_json = row.raw_json
      WITH t, row
      MATCH (i:Image {file_name: row.file_name})
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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import neo4j, { type ManagedTransaction, type Session } from 'neo4j-driver';

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

const NEO4J_URI = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'neo4j_password';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE ?? 'neo4j';
const BATCH_SIZE = Number(process.env.NEO4J_SEED_BATCH_SIZE ?? 300);
const CLEAR_EXISTING = (process.env.NEO4J_SEED_CLEAR ?? 'false').toLowerCase() === 'true';

const chunk = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const readJsonFile = <T,>(filePath: string): T => {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
};

const runBatched = async <T,>(
  session: Session,
  query: string,
  rows: T[],
  label: string,
) => {
  const groups = chunk(rows, BATCH_SIZE);
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    await session.executeWrite((tx: ManagedTransaction) => tx.run(query, { rows: group }));
    console.log(`[seed] ${label}: lote ${i + 1}/${groups.length} (${group.length} itens)`);
  }
};

const createConstraints = async (session: Session) => {
  await session.executeWrite((tx: ManagedTransaction) =>
    tx.run('CREATE CONSTRAINT image_id IF NOT EXISTS FOR (n:Image) REQUIRE n.id IS UNIQUE'),
  );
  await session.executeWrite((tx: ManagedTransaction) =>
    tx.run('CREATE CONSTRAINT annotation_id IF NOT EXISTS FOR (n:Annotation) REQUIRE n.id IS UNIQUE'),
  );
  await session.executeWrite((tx: ManagedTransaction) =>
    tx.run('CREATE CONSTRAINT category_id IF NOT EXISTS FOR (n:Category) REQUIRE n.id IS UNIQUE'),
  );
  await session.executeWrite((tx: ManagedTransaction) =>
    tx.run('CREATE CONSTRAINT tile_id IF NOT EXISTS FOR (n:Tile) REQUIRE n.id IS UNIQUE'),
  );
};

const main = async () => {
  const coco = readJsonFile<CocoFile>(COCO_PATH);
  const dcis = readJsonFile<DcisEntry[]>(DCIS_PATH);

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  await driver.verifyConnectivity();

  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    if (CLEAR_EXISTING) {
      await session.executeWrite((tx: ManagedTransaction) => tx.run('MATCH (n) DETACH DELETE n'));
      console.log('[seed] Banco limpo (NEO4J_SEED_CLEAR=true).');
    }

    await createConstraints(session);

    const categoriesRows = coco.categories.map((category) => ({
      id: category.id,
      name: category.name,
      supercategory: category.supercategory ?? null,
      raw_json: JSON.stringify(category),
    }));

    await runBatched(
      session,
      `
      UNWIND $rows AS row
      MERGE (c:Category {id: row.id})
      SET c.name = row.name,
          c.supercategory = row.supercategory,
          c.raw_json = row.raw_json
      `,
      categoriesRows,
      'categorias',
    );

    const imageRows = coco.images.map((image) => ({
      id: image.id,
      file_name: image.file_name,
      width: image.width,
      height: image.height,
      license: image.license ?? null,
      date_captured: image.date_captured ?? null,
      raw_json: JSON.stringify(image),
    }));

    await runBatched(
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
      'imagens',
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

    await runBatched(
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
      'anotacoes',
    );

    const tileRows = dcis.map((entry) => ({
      id: entry.id,
      key: entry.key ?? null,
      file_name: entry.file_name ?? null,
      width: entry.width ?? null,
      height: entry.height ?? null,
      mpp: entry.mpp ?? null,
      global_x: entry.global_x ?? null,
      global_y: entry.global_y ?? null,
      raw_json: JSON.stringify(entry),
    }));

    await runBatched(
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
      'tiles',
    );

    const countsResult = await session.executeRead((tx: ManagedTransaction) =>
      tx.run(
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
      ),
    );

    const stats = countsResult.records[0]?.toObject() ?? {};
    console.log('[seed] Finalizado com sucesso.');
    console.log('[seed] Contagens:', stats);
  } finally {
    await session.close();
    await driver.close();
  }
};

main().catch((error: unknown) => {
  console.error('[seed] Falha ao executar seed no Neo4j.');
  console.error(error);
  process.exit(1);
});

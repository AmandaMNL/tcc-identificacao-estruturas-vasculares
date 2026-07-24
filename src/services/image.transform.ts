import path from 'node:path';
import neo4j from 'neo4j-driver';
import { Neo4jService } from './neo4j.service.ts';

type Neo4jImageNode = {
  id: number;
  file_name: string;
  width: number;
  height: number;
  raw_json?: string;
};

type Neo4jTileNode = {
  id: number;
  key?: number;
  file_name?: string;
  width?: number;
  height?: number;
  mpp?: number;
  global_x?: number;
  global_y?: number;
  raw_json?: string;
};

export type CategorySummary = {
  categoryId: number;
  categoryName: string;
  annotationCount: number;
  totalArea: number;
};

export type AnnotationSample = {
  annotationId: number;
  categoryId: number;
  categoryName: string;
  area: number;
  bboxJson: string | null;
  segmentationJson: string | null;
};

export type ImageTransformResult = {
  fileName: string;
  image: Neo4jImageNode;
  tile: Neo4jTileNode | null;
  topCategories: CategorySummary[];
  topAnnotations: AnnotationSample[];
  promptContext: string;
};

const asNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (neo4j.isInt(value)) {
    return value.toNumber();
  }

  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
};

const clampTopK = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 3;
  }

  return Math.max(1, Math.min(10, Math.trunc(value)));
};

const toFileName = (imagePathOrFileName: string): string => {
  const rawName = path.basename(imagePathOrFileName.trim());
  const ext = path.extname(rawName) || '.png';
  const base = rawName.slice(0, rawName.length - ext.length);
  const normalizedBase = base.endsWith('_rgb_labels')
    ? base.slice(0, -'_rgb_labels'.length)
    : base;

  return `${normalizedBase}${ext}`;
};

const toImageId = (fileName: string): number | null => {
  const base = path.basename(fileName, path.extname(fileName));
  const numericPart = base.match(/^\d+$/);

  if (!numericPart) {
    return null;
  }

  return Number(numericPart[0]);
};

export class ImageTransformService {
  private readonly neo4jService: Neo4jService;

  constructor(neo4jService = new Neo4jService()) {
    this.neo4jService = neo4jService;
  }

  async close(): Promise<void> {
    await this.neo4jService.close();
  }

  async getImageContext(imagePathOrFileName: string, topK = 3): Promise<ImageTransformResult> {
    const fileName = toFileName(imagePathOrFileName);
    const imageId = toImageId(fileName);
    const limitedTopK = clampTopK(topK);

    const session = this.neo4jService.createSession();

    try {
      const imageResult = await session.executeRead((tx) =>
        tx.run(
          `
          MATCH (i:Image {file_name: $fileName})
          OPTIONAL MATCH (t:Tile)-[:REFERS_TO_IMAGE]->(i)
          RETURN i, t
          LIMIT 1
          `,
          { fileName },
        ),
      );

      const suffixImageResult = imageResult.records.length > 0
        ? imageResult
        : await session.executeRead((tx) =>
          tx.run(
            `
            MATCH (i:Image)
            WHERE i.file_name ENDS WITH $fileSuffix
            OPTIONAL MATCH (t:Tile {id: i.id})
            RETURN i, t
            LIMIT 1
            `,
            { fileSuffix: `/${fileName}` },
          ),
        );

      const tileMappedResult = suffixImageResult.records.length > 0
        ? suffixImageResult
        : await session.executeRead((tx) =>
          tx.run(
            `
            MATCH (t:Tile {file_name: $fileName})
            OPTIONAL MATCH (i:Image {id: t.id})
            RETURN i, t
            LIMIT 1
            `,
            { fileName },
          ),
        );

      const resolvedImageResult = tileMappedResult.records.length > 0
        ? tileMappedResult
        : await session.executeRead((tx) =>
          tx.run(
            `
            MATCH (i:Image {id: $imageId})
            OPTIONAL MATCH (t:Tile {key: $imageId})
            RETURN i, t
            LIMIT 1
            `,
            { imageId },
          ),
        );

      if (resolvedImageResult.records.length === 0) {
        throw new Error(`Imagem nao encontrada no Neo4j: ${fileName}`);
      }

      const firstRecord = resolvedImageResult.records[0];
      const imageValue = firstRecord.get('i');
      if (!imageValue) {
        throw new Error(`Imagem encontrada sem no Image correspondente: ${fileName}`);
      }

      const imageNode = imageValue.properties as Record<string, unknown>;
      const tileValue = firstRecord.get('t');
      const tileNode = tileValue?.properties as Record<string, unknown> | undefined;
      const resolvedImageId = asNumber(imageNode.id);

      const topCategoriesResult = await session.executeRead((tx) =>
        tx.run(
          `
          MATCH (i:Image {id: $imageId})
          MATCH (a:Annotation)-[:BELONGS_TO_IMAGE]->(i)
          MATCH (a)-[:HAS_CATEGORY]->(c:Category)
          RETURN
            c.id AS categoryId,
            c.name AS categoryName,
            count(a) AS annotationCount,
            sum(coalesce(a.area, 0)) AS totalArea
          ORDER BY annotationCount DESC, totalArea DESC
          LIMIT $topK
          `,
          { imageId: resolvedImageId, topK: neo4j.int(limitedTopK) },
        ),
      );

      const topAnnotationsResult = await session.executeRead((tx) =>
        tx.run(
          `
          MATCH (i:Image {id: $imageId})
          MATCH (a:Annotation)-[:BELONGS_TO_IMAGE]->(i)
          MATCH (a)-[:HAS_CATEGORY]->(c:Category)
          RETURN
            a.id AS annotationId,
            c.id AS categoryId,
            c.name AS categoryName,
            coalesce(a.area, 0) AS area,
            a.bbox_json AS bboxJson,
            a.segmentation_json AS segmentationJson
          ORDER BY area DESC
          LIMIT $topK
          `,
          { imageId: resolvedImageId, topK: neo4j.int(limitedTopK) },
        ),
      );

      const image: Neo4jImageNode = {
        id: asNumber(imageNode.id),
        file_name: String(imageNode.file_name ?? ''),
        width: asNumber(imageNode.width),
        height: asNumber(imageNode.height),
        raw_json: imageNode.raw_json ? String(imageNode.raw_json) : undefined,
      };

      const tile: Neo4jTileNode | null = tileNode
        ? {
          id: asNumber(tileNode.id),
          key: tileNode.key === undefined || tileNode.key === null ? undefined : asNumber(tileNode.key),
          file_name: tileNode.file_name ? String(tileNode.file_name) : undefined,
          width: tileNode.width === undefined || tileNode.width === null ? undefined : asNumber(tileNode.width),
          height: tileNode.height === undefined || tileNode.height === null ? undefined : asNumber(tileNode.height),
          mpp: tileNode.mpp === undefined || tileNode.mpp === null ? undefined : Number(tileNode.mpp),
          global_x: tileNode.global_x === undefined || tileNode.global_x === null ? undefined : asNumber(tileNode.global_x),
          global_y: tileNode.global_y === undefined || tileNode.global_y === null ? undefined : asNumber(tileNode.global_y),
          raw_json: tileNode.raw_json ? String(tileNode.raw_json) : undefined,
        }
        : null;

      const topCategories: CategorySummary[] = topCategoriesResult.records.map((record) => ({
        categoryId: asNumber(record.get('categoryId')),
        categoryName: String(record.get('categoryName')),
        annotationCount: asNumber(record.get('annotationCount')),
        totalArea: asNumber(record.get('totalArea')),
      }));

      const topAnnotations: AnnotationSample[] = topAnnotationsResult.records.map((record) => ({
        annotationId: asNumber(record.get('annotationId')),
        categoryId: asNumber(record.get('categoryId')),
        categoryName: String(record.get('categoryName')),
        area: asNumber(record.get('area')),
        bboxJson: record.get('bboxJson') === null ? null : String(record.get('bboxJson')),
        segmentationJson: record.get('segmentationJson') === null ? null : String(record.get('segmentationJson')),
      }));

      const promptContext = JSON.stringify(
        {
          file_name: image.file_name,
          image,
          tile,
          top_categories: topCategories,
          top_annotations: topAnnotations,
        },
        null,
        2,
      );

      return {
        fileName,
        image,
        tile,
        topCategories,
        topAnnotations,
        promptContext,
      };
    } finally {
      await session.close();
    }
  }
}

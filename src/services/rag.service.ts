import neo4j from 'neo4j-driver';
import { Neo4jService } from './neo4j.service.ts';
import type { ImageSignature } from './image.signature.ts';

type Neo4jImageNode = {
  id: number | string;
  file_name: string;
  width: number;
  height: number;
  raw_json?: string;
};

type Neo4jTileNode = {
  id: number | string;
  key?: number | string;
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
  annotationId: number | string;
  categoryId: number | string;
  categoryName: string;
  area: number;
  bboxJson: string | null;
  segmentationJson: string | null;
};

export type RagContextResult = {
  fileName: string;
  image: Neo4jImageNode;
  tile: Neo4jTileNode | null;
  topCategories: CategorySummary[];
  topAnnotations: AnnotationSample[];
  promptContext: string;
};

type NearbyImageSample = {
  imageId: number | string;
  fileName: string;
  tileKey: number | string | null;
  globalX: number;
  globalY: number;
  spatialDistance: number;
};

function asNumber(value: unknown): number {
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
}

function asPreciseInteger(value: unknown): number | string {
  if (neo4j.isInt(value)) {
    return value.inSafeRange() ? value.toNumber() : value.toString();
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0;
    }

    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return Math.trunc(value).toString();
    }

    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isSafeInteger(parsed) ? parsed : trimmed;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value === null || value === undefined) {
    return 0;
  }

  return asNumber(value);
}

const clampTopK = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 3;
  }

  return Math.max(1, Math.min(10, Math.trunc(value)));
};

export class RagService {
  private readonly neo4jService: Neo4jService;

  constructor(neo4jService = new Neo4jService()) {
    this.neo4jService = neo4jService;
  }

  async close(): Promise<void> {
    await this.neo4jService.close();
  }

  async getImageContext(imageSignature: string, topK = 3): Promise<RagContextResult> {
    const limitedTopK = clampTopK(topK);
    const neighborLimit = Math.max(3, limitedTopK * 3);
    if (!imageSignature?.trim()) {
      throw new Error('imageSignature is required for proximity retrieval.');
    }

    const signature = JSON.parse(imageSignature) as ImageSignature;

    const session = this.neo4jService.createSession();

    try {
      const proximityImageResult = await session.executeRead((tx) =>
        tx.run(
          `
          MATCH (i:Image)
          WHERE i.sig_m0 IS NOT NULL
            AND i.sig_m1 IS NOT NULL
            AND i.sig_m2 IS NOT NULL
            AND i.sig_m3 IS NOT NULL
            AND i.sig_m4 IS NOT NULL
            AND i.sig_m5 IS NOT NULL
            AND i.sig_m6 IS NOT NULL
            AND i.sig_m7 IS NOT NULL
          WITH i,
               sqrt(
                 ((coalesce(i.sig_m0, 0) - $sig_m0) * (coalesce(i.sig_m0, 0) - $sig_m0)) +
                 ((coalesce(i.sig_m1, 0) - $sig_m1) * (coalesce(i.sig_m1, 0) - $sig_m1)) +
                 ((coalesce(i.sig_m2, 0) - $sig_m2) * (coalesce(i.sig_m2, 0) - $sig_m2)) +
                 ((coalesce(i.sig_m3, 0) - $sig_m3) * (coalesce(i.sig_m3, 0) - $sig_m3)) +
                 ((coalesce(i.sig_m4, 0) - $sig_m4) * (coalesce(i.sig_m4, 0) - $sig_m4)) +
                 ((coalesce(i.sig_m5, 0) - $sig_m5) * (coalesce(i.sig_m5, 0) - $sig_m5)) +
                 ((coalesce(i.sig_m6, 0) - $sig_m6) * (coalesce(i.sig_m6, 0) - $sig_m6)) +
                 ((coalesce(i.sig_m7, 0) - $sig_m7) * (coalesce(i.sig_m7, 0) - $sig_m7))
               ) +
               abs(coalesce(i.sig_mean, 0) - $sig_mean) * 0.25 +
               abs(coalesce(i.sig_std, 0) - $sig_std) * 0.25 AS visualDistance
          OPTIONAL MATCH (t:Tile)-[:REFERS_TO_IMAGE]->(i)
          RETURN i, t, visualDistance
          ORDER BY visualDistance ASC, i.id ASC
          LIMIT 1
          `,
          {
            sig_m0: signature.bands[0] ?? 0,
            sig_m1: signature.bands[1] ?? 0,
            sig_m2: signature.bands[2] ?? 0,
            sig_m3: signature.bands[3] ?? 0,
            sig_m4: signature.bands[4] ?? 0,
            sig_m5: signature.bands[5] ?? 0,
            sig_m6: signature.bands[6] ?? 0,
            sig_m7: signature.bands[7] ?? 0,
            sig_mean: signature.mean,
            sig_std: signature.std,
          },
        ),
      );

      if (proximityImageResult.records.length === 0) {
        throw new Error('Nenhuma imagem com assinatura visual foi encontrada no Neo4j. Rode o seed novamente para popular sig_m0..sig_m7.');
      }

      const firstRecord = proximityImageResult.records[0];
      const imageValue = firstRecord.get('i');
      if (!imageValue) {
        throw new Error('Imagem encontrada sem no Image correspondente no Neo4j.');
      }

      const imageNode = imageValue.properties as Record<string, unknown>;
      const tileValue = firstRecord.get('t');
      const tileNode = tileValue?.properties as Record<string, unknown> | undefined;
      const visualDistance = asNumber(firstRecord.get('visualDistance'));
      const resolvedImageId = neo4j.isInt(imageNode.id)
        ? imageNode.id
        : neo4j.int(asNumber(imageNode.id));
      const anchorX = tileNode?.global_x === undefined || tileNode?.global_x === null
        ? null
        : asNumber(tileNode.global_x);
      const anchorY = tileNode?.global_y === undefined || tileNode?.global_y === null
        ? null
        : asNumber(tileNode.global_y);

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

      const nearbyImagesResult = anchorX === null || anchorY === null
        ? { records: [] }
        : await session.executeRead((tx) =>
          tx.run(
            `
            MATCH (t:Tile)-[:REFERS_TO_IMAGE]->(i:Image)
            WHERE t.global_x IS NOT NULL AND t.global_y IS NOT NULL
            WITH i, t,
                 sqrt(
                   ((toFloat(t.global_x) - toFloat($anchorX)) * (toFloat(t.global_x) - toFloat($anchorX))) +
                   ((toFloat(t.global_y) - toFloat($anchorY)) * (toFloat(t.global_y) - toFloat($anchorY)))
                 ) AS spatialDistance
            ORDER BY spatialDistance ASC, i.id ASC
            RETURN
              i.id AS imageId,
              i.file_name AS fileName,
              t.key AS tileKey,
              coalesce(t.global_x, 0) AS globalX,
              coalesce(t.global_y, 0) AS globalY,
              spatialDistance
            LIMIT $neighborLimit
            `,
            {
              anchorX,
              anchorY,
              neighborLimit: neo4j.int(neighborLimit),
            },
          ),
        );

      const image: Neo4jImageNode = {
        id: asPreciseInteger(imageNode.id),
        file_name: String(imageNode.file_name ?? ''),
        width: asNumber(imageNode.width),
        height: asNumber(imageNode.height),
        raw_json: imageNode.raw_json ? String(imageNode.raw_json) : undefined,
      };

      const tile: Neo4jTileNode | null = tileNode
        ? {
          id: asPreciseInteger(tileNode.id),
          key: tileNode.key === undefined || tileNode.key === null ? undefined : asPreciseInteger(tileNode.key),
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
        annotationId: asPreciseInteger(record.get('annotationId')),
        categoryId: asPreciseInteger(record.get('categoryId')),
        categoryName: String(record.get('categoryName')),
        area: asNumber(record.get('area')),
        bboxJson: record.get('bboxJson') === null ? null : String(record.get('bboxJson')),
        segmentationJson: record.get('segmentationJson') === null ? null : String(record.get('segmentationJson')),
      }));

      const nearbyImages: NearbyImageSample[] = nearbyImagesResult.records.map((record) => ({
        imageId: asPreciseInteger(record.get('imageId')),
        fileName: String(record.get('fileName') ?? ''),
        tileKey: record.get('tileKey') === null ? null : asPreciseInteger(record.get('tileKey')),
        globalX: asNumber(record.get('globalX')),
        globalY: asNumber(record.get('globalY')),
        spatialDistance: asNumber(record.get('spatialDistance')),
      }));

      const promptContext = JSON.stringify(
        {
          retrieval: {
            strategy: 'visual_signature_plus_spatial_proximity',
            input_signature: signature,
            matched_visual_distance: visualDistance,
            anchor_coordinates: {
              global_x: anchorX,
              global_y: anchorY,
            },
            nearby_images: nearbyImages,
          },
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
        fileName: image.file_name,
        image,
        tile,
        topCategories,
        topAnnotations,
        promptContext,
      };
    } catch (error) {
      console.error('Erro ao obter contexto da imagem no Neo4j:', error);
      throw error;
    }
    finally {
      await session.close();
    }
  }
}

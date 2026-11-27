import type { GraphState } from '../graph.ts';
import type { ImageAnnotatorService } from '../../services/image.annotator.ts';

type OverlayDependencies = {
  imageAnnotatorService: Pick<ImageAnnotatorService, 'annotateFromCoordinates'>;
};

type CoordinatesPayload = {
  vascular_structures?: Array<{
    id: string | number | null;
    label?: string;
    confidence: number;
    contour_points?: Array<{
      x: number;
      y: number;
    }>;
    x?: number;
    y?: number;
  }>;
  tumor_boundaries?: Array<{
    x: number;
    y: number;
  }>;
  annotated_image_base64?: string;
};

const pointsToSvg = (points: Array<{ x: number; y: number }>, width: number, height: number): string => {
  return points
    .map((point) => `${Math.max(0, Math.min(width, point.x))},${Math.max(0, Math.min(height, point.y))}`)
    .join(' ');
};

const contourToPolygon = (contourPoints?: Array<{ x: number; y: number }>, x?: number, y?: number): Array<{ x: number; y: number }> => {
  if (Array.isArray(contourPoints) && contourPoints.length >= 3) {
    return contourPoints;
  }

  if (typeof x === 'number' && typeof y === 'number') {
    return [
      { x: x - 10, y: y - 10 },
      { x: x + 10, y: y - 10 },
      { x: x + 10, y: y + 10 },
      { x: x - 10, y: y + 10 },
    ];
  }

  return [];
};

// O LLM devolve coordenadas normalizadas 0-1000 (ver prompts/image.analiser.ts).
export const NORMALIZED_COORDINATE_SCALE = 1000;

const toPixels = (point: { x: number; y: number }, width: number, height: number) => ({
  x: Math.round((point.x / NORMALIZED_COORDINATE_SCALE) * width),
  y: Math.round((point.y / NORMALIZED_COORDINATE_SCALE) * height),
});

export function applyOverlay(dependencies: OverlayDependencies) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const parsed = JSON.parse(state.llmResponse) as CoordinatesPayload;
    const { imageWidth: width, imageHeight: height } = state;
    const scalePoint = (point: { x: number; y: number }) => toPixels(point, width, height);

    const vascularStructures = (Array.isArray(parsed.vascular_structures) ? parsed.vascular_structures : [])
      .map((structure) => ({
        ...structure,
        contour_points: structure.contour_points?.map(scalePoint),
        ...(typeof structure.x === 'number' && typeof structure.y === 'number'
          ? scalePoint({ x: structure.x, y: structure.y })
          : {}),
      }));
    const tumorBoundaries = (Array.isArray(parsed.tumor_boundaries) ? parsed.tumor_boundaries : [])
      .map(scalePoint);

    const normalizedStructures = vascularStructures
      .map((structure) => ({
        ...structure,
        contour_points: contourToPolygon(structure.contour_points, structure.x, structure.y),
      }))
      .filter((structure) => structure.contour_points.length > 0);

    const annotatedImageBase64 = await dependencies.imageAnnotatorService.annotateFromCoordinates(
      state.imageBase64,
      {
        vascular_structures: normalizedStructures,
        tumor_boundaries: tumorBoundaries,
      },
    );

    return {
      // JSON salvo fica em pixels da imagem original.
      llmResponse: JSON.stringify({
        ...parsed,
        coordinate_space: 'pixels',
        vascular_structures: vascularStructures,
        tumor_boundaries: tumorBoundaries,
        annotated_image_base64: annotatedImageBase64,
      }),
    };
  };
}

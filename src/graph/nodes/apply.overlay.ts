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

export function applyOverlay(dependencies: OverlayDependencies) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const parsed = JSON.parse(state.llmResponse) as CoordinatesPayload;

    const vascularStructures = Array.isArray(parsed.vascular_structures)
      ? parsed.vascular_structures
      : [];
    const tumorBoundaries = Array.isArray(parsed.tumor_boundaries)
      ? parsed.tumor_boundaries
      : [];

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
      llmResponse: JSON.stringify({
        ...parsed,
        annotated_image_base64: annotatedImageBase64,
      }),
    };
  };
}

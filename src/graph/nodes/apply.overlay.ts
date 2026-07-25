import type { GraphState } from '../graph.ts';
import type { ImageAnnotatorService } from '../../services/image.annotator.ts';

type OverlayDependencies = {
  imageAnnotatorService: Pick<ImageAnnotatorService, 'annotateFromCoordinates'>;
};

type CoordinatesPayload = {
  vascular_structures?: Array<{
    id: string | null;
    label?: string;
    x: number;
    y: number;
    confidence: number;
  }>;
  tumor_boundaries?: Array<{
    x: number;
    y: number;
  }>;
  annotated_image_base64?: string;
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

    const annotatedImageBase64 = await dependencies.imageAnnotatorService.annotateFromCoordinates(
      state.imageBase64,
      {
        vascular_structures: vascularStructures,
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

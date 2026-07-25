import type { GraphState } from '../graph.ts';
import type { ImageAnnotatorService } from '../../services/image.annotator.ts';

type SaveResultDependencies = {
  imageAnnotatorService: Pick<ImageAnnotatorService, 'saveBase64Image'>;
};

type SaveablePayload = {
  annotated_image_base64?: string;
};

export function saveResult(dependencies: SaveResultDependencies) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    if (!state.llmResponse?.trim()) {
      return {};
    }

    const parsed = JSON.parse(state.llmResponse) as SaveablePayload;

    if (!parsed.annotated_image_base64) {
      return {};
    }

    const responseImagePath = dependencies.imageAnnotatorService.saveBase64Image(
      parsed.annotated_image_base64,
      'response',
    );

    return {
      responseImagePath,
    };
  };
}

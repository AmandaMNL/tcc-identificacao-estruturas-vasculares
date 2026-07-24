import type { GraphState } from '../graph.ts';
import type { ImageService } from '../../services/image.service.ts';
import type { ImageTransformService } from '../../services/image.transform.ts';
import config from '../../config.ts';

type ProcessImageDependencies = {
  imageTransformService: Pick<ImageTransformService, 'getImageContext'>;
  imageService: Pick<ImageService, 'readAsBase64'>;
};

export function processImage(dependencies: ProcessImageDependencies) {
  const topK = config.topK;
  const sendImageToLlm = config.sendImageToLlm;

  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const imagePath = state.imagePath?.trim();

    if (!imagePath) {
      throw new Error('imagePath is required to load image and Neo4j context.');
    }

    const imageBase64 = sendImageToLlm
      ? dependencies.imageService.readAsBase64(imagePath)
      : '';

    const imageContext = await dependencies.imageTransformService.getImageContext(imagePath, topK);

    return {
      imagePath,
      imageBase64,
      content: imageContext.promptContext,
    };
  };
}
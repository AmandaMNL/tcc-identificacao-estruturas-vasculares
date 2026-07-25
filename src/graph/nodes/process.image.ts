import type { GraphState } from '../graph.ts';
import { getImageSignatureFromBase64, normalizeImageBase64 } from '../../services/image.signature.ts';

export function processImage() {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const inputBase64 = state.imageBase64?.trim() ?? '';

    const normalizedImage = await normalizeImageBase64(inputBase64);
    const imageBase64 = normalizedImage.base64;

    if (!imageBase64) {
      throw new Error('Nao foi possivel obter imageBase64 para processamento.');
    }

    const imageSignature = JSON.stringify(await getImageSignatureFromBase64(imageBase64));

    return {
      imageBase64,
      imageMimeType: normalizedImage.mimeType,
      imageWidth: normalizedImage.width,
      imageHeight: normalizedImage.height,
      imageSignature,
      content: '',
    };
  };
}
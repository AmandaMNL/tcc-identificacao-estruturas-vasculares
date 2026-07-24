import type { GraphState } from '../graph.ts';
import { getImageSignatureFromBase64 } from '../../services/image.signature.ts';

export function processImage() {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const inputBase64 = state.imageBase64?.trim() ?? '';

    const imageBase64 = inputBase64;

    if (!imageBase64) {
      throw new Error('Nao foi possivel obter imageBase64 para processamento.');
    }

    const imageSignature = JSON.stringify(getImageSignatureFromBase64(imageBase64));

    return {
      imageBase64,
      imageSignature,
      content: '',
    };
  };
}
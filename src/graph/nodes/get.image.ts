import type { GraphState } from '../graph.ts';

const parseImageInput = (rawInput: string): { mimeType: string; base64: string } => {
  const input = rawInput.trim();
  const dataUrlMatch = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);

  if (!dataUrlMatch) {
    return {
      mimeType: 'image/png',
      base64: input,
    };
  }

  return {
    mimeType: dataUrlMatch[1],
    base64: dataUrlMatch[2].replace(/\s+/g, ''),
  };
};

export function getImage() {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const inputBase64 = state.imageBase64?.trim() ?? '';

    if (!inputBase64) {
      throw new Error('imageBase64 is required.');
    }

    const parsedInput = parseImageInput(inputBase64);

    return {
      imageBase64: parsedInput.base64,
      imageMimeType: parsedInput.mimeType,
    };
  };
}
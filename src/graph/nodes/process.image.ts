import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { GraphState } from '../graph.ts';
import { ImageTransformService } from '../../services/image.transform.ts';

const DEFAULT_TOP_K = Number(process.env.NEO4J_TOP_K ?? 3);
const SEND_IMAGE_TO_LLM = (process.env.LLM_SEND_IMAGE ?? 'true').toLowerCase() === 'true';

const resolveLocalImagePath = (imagePath: string): string => {
  const directPath = path.resolve(process.cwd(), imagePath);

  if (existsSync(directPath)) {
    return directPath;
  }

  const ext = path.extname(imagePath) || '.png';
  const base = path.basename(imagePath, ext);
  const fallbackName = `${base}_rgb_labels${ext}`;
  const fallbackPath = path.resolve(process.cwd(), 'data/images', fallbackName);

  if (existsSync(fallbackPath)) {
    return fallbackPath;
  }

  throw new Error(`Image file not found: ${imagePath}`);
};

export function processImage() {

  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const imagePath = state.imagePath?.trim();

    if (!imagePath) {
      throw new Error('imagePath is required to load image and Neo4j context.');
    }

    const imageBase64 = SEND_IMAGE_TO_LLM
      ? readFileSync(resolveLocalImagePath(imagePath)).toString('base64')
      : '';

    const imageTransformService = new ImageTransformService();

    try {
      const imageContext = await imageTransformService.getImageContext(imagePath, DEFAULT_TOP_K);

      return {
        imagePath,
        imageBase64,
        content: imageContext.promptContext,
      };
    } finally {
      await imageTransformService.close();
    }
  };
}
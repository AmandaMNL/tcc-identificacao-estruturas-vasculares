import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export type ImagePayload = {
  resolvedPath: string;
  mimeType: string;
  base64: string;
};

export class ImageService {
  resolveLocalImagePath(imagePathArg: string): string {
    const directPath = path.resolve(process.cwd(), imagePathArg);

    if (existsSync(directPath)) {
      return directPath;
    }

    const ext = path.extname(imagePathArg) || '.png';
    const base = path.basename(imagePathArg, ext);
    const fallbackName = `${base}_rgb_labels${ext}`;
    const fallbackPath = path.resolve(process.cwd(), 'data/images', fallbackName);

    if (existsSync(fallbackPath)) {
      return fallbackPath;
    }

    throw new Error(`Image file not found: ${imagePathArg}`);
  }

  resolveMimeType(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();
    return MIME_BY_EXTENSION[ext] ?? 'image/png';
  }

  readAsBase64(imagePathArg: string): string {
    return readFileSync(this.resolveLocalImagePath(imagePathArg)).toString('base64');
  }

  toPayload(imagePathArg: string): ImagePayload {
    const resolvedPath = this.resolveLocalImagePath(imagePathArg);

    return {
      resolvedPath,
      mimeType: this.resolveMimeType(resolvedPath),
      base64: readFileSync(resolvedPath).toString('base64'),
    };
  }
}

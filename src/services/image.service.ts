import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

const IMAGES_ROOT = path.resolve(process.cwd(), 'data/images');

const findUniqueImagePath = (rootPath: string, targetFileName: string): string | null => {
  const matches: string[] = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath) {
      continue;
    }

    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === targetFileName) {
        matches.push(entryPath);
      }
    }
  }

  if (matches.length > 1) {
    throw new Error(`Image file is ambiguous: ${targetFileName}. Use a patient-specific path.`);
  }

  return matches[0] ?? null;
};

export class ImageService {
  resolveLocalImagePath(imagePathArg: string): string {
    const directPath = path.resolve(process.cwd(), imagePathArg);

    if (existsSync(directPath)) {
      return directPath;
    }

    const nestedPath = path.resolve(IMAGES_ROOT, imagePathArg);
    if (existsSync(nestedPath)) {
      return nestedPath;
    }

    const ext = path.extname(imagePathArg) || '.png';
    const base = path.basename(imagePathArg, ext);
    const fallbackName = `${base}_rgb_labels${ext}`;
    const fallbackPath = path.resolve(IMAGES_ROOT, path.dirname(imagePathArg), fallbackName);

    if (existsSync(fallbackPath)) {
      return fallbackPath;
    }

    const discoveredPath = findUniqueImagePath(IMAGES_ROOT, fallbackName)
      ?? findUniqueImagePath(IMAGES_ROOT, path.basename(imagePathArg));

    if (discoveredPath) {
      return discoveredPath;
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

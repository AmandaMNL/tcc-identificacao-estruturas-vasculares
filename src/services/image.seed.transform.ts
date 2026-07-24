import path from 'node:path';

export type SeedImageInput = {
  id?: number;
  file_name: string;
  width: number;
  height: number;
  license?: number;
  date_captured?: string;
};

export type SeedImageRow = {
  id: number;
  file_name: string;
  width: number;
  height: number;
  license: number | null;
  date_captured: string | null;
  raw_json: string;
};

const normalizeExtension = (fileName: string): string => {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.pmg') {
    return `${fileName.slice(0, -ext.length)}.png`;
  }

  return fileName;
};

const parseIdFromFileName = (fileName: string): number => {
  const base = path.basename(fileName, path.extname(fileName));
  const numeric = base.match(/^\d+$/);

  if (!numeric) {
    throw new Error(`Unable to infer image id from file name: ${fileName}`);
  }

  return Number(numeric[0]);
};

export class ImageSeedTransformService {
  normalizeFileName(fileName: string): string {
    return normalizeExtension(fileName).replaceAll('\\\\', '/');
  }

  toSeedImageRow(image: SeedImageInput): SeedImageRow {
    const normalizedFileName = this.normalizeFileName(image.file_name);

    return {
      id: image.id ?? parseIdFromFileName(normalizedFileName),
      file_name: normalizedFileName,
      width: image.width,
      height: image.height,
      license: image.license ?? null,
      date_captured: image.date_captured ?? null,
      raw_json: JSON.stringify({
        ...image,
        file_name: normalizedFileName,
      }),
    };
  }
}

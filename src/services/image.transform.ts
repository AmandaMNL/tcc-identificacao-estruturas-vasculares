import path from 'node:path';

export type ImageTransformResult = {
  imagePath: string;
  fileName: string;
  imageId: string | null;
};

const toFileName = (imagePathOrFileName: string): string => {
  const rawName = path.basename(imagePathOrFileName.trim());
  const ext = path.extname(rawName) || '.png';
  const base = rawName.slice(0, rawName.length - ext.length);
  const normalizedBase = base.endsWith('_rgb_labels')
    ? base.slice(0, -'_rgb_labels'.length)
    : base;

  return `${normalizedBase}${ext}`;
};

const toImageId = (fileName: string): string | null => {
  const base = path.basename(fileName, path.extname(fileName));
  const numericPart = base.match(/^\d+$/);

  if (!numericPart) {
    return null;
  }

  return numericPart[0];
};

export class ImageTransformService {
  transform(imagePathOrFileName: string): ImageTransformResult {
    const imagePath = imagePathOrFileName.trim();
    const fileName = toFileName(imagePath);

    return {
      imagePath,
      fileName,
      imageId: toImageId(fileName),
    };
  }
}

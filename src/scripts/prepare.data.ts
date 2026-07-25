import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

type CocoImage = {
  id: number;
  file_name: string;
  width: number;
  height: number;
  global_x?: number;
  global_y?: number;
};

type CocoAnnotation = {
  id: number;
  image_id: number;
  category_id: number;
  segmentation?: unknown;
};

type CocoCategory = {
  id: number;
  name: string;
};

type CocoFile = {
  images: CocoImage[];
  annotations: CocoAnnotation[];
  categories: CocoCategory[];
};

type ManifestEntry = {
  file_name: string;
  height: number;
  width: number;
  mpp: number;
  key: number;
  global_x?: number;
  global_y?: number;
  id: number;
};

type MatchedImage = {
  localFileName: string;
  cocoImage: CocoImage;
};

const ROOT = process.cwd();
const IMAGES_RAW_ROOT = path.resolve(ROOT, 'data/imagesRaw/DCIS');
const IMAGES_ROOT = path.resolve(ROOT, 'data/images/DCIS');
const MASK_ROOT = path.resolve(ROOT, 'data/mask/DCIS');
const ANNOTATIONS_ROOT = path.resolve(ROOT, 'data/annotations/DCIS');
const COCO_PATH = path.resolve(ROOT, 'data/annotations/COCO_annotations.json');
const DEFAULT_MPP = 0.5;
const VESSEL_CATEGORY_NAMES = new Set([
  'not dilated vessel',
  'Intermediately dilated vessel',
  'highly dilated vessel',
]);

const OVERLAY_STYLES: Record<string, { fill: string; stroke: string }> = {
  'not dilated vessel': { fill: '#00e67633', stroke: '#00c853' },
  'Intermediately dilated vessel': { fill: '#ffea0033', stroke: '#ffd600' },
  'highly dilated vessel': { fill: '#ff525233', stroke: '#d50000' },
  'CCL21+': { fill: '#40c4ff22', stroke: '#00b0ff' },
};

const escapeXml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const readJson = <T,>(filePath: string): T => JSON.parse(readFileSync(filePath, 'utf-8')) as T;

const numericFileSort = (left: string, right: string) => {
  const leftNumber = Number.parseInt(path.basename(left, path.extname(left)), 10);
  const rightNumber = Number.parseInt(path.basename(right, path.extname(right)), 10);

  return leftNumber - rightNumber;
};

const listPatientFolders = () => readdirSync(IMAGES_RAW_ROOT)
  .filter((name) => name.startsWith('Patient_'))
  .sort();

const listRawFiles = (patientFolder: string) => readdirSync(path.join(IMAGES_RAW_ROOT, patientFolder))
  .filter((name) => name.toLowerCase().endsWith('.png'))
  .sort(numericFileSort);

const toManifestEntry = (fileName: string, image: CocoImage): ManifestEntry => ({
  file_name: fileName,
  height: image.height,
  width: image.width,
  mpp: DEFAULT_MPP,
  key: Number.parseInt(path.basename(fileName, path.extname(fileName)), 10),
  global_x: image.global_x,
  global_y: image.global_y,
  id: image.id,
});

const matchPatientFiles = (
  patientFolder: string,
  cocoImages: CocoImage[],
  startIndex: number,
): { matches: MatchedImage[]; nextIndex: number } => {
  const localFiles = listRawFiles(patientFolder);
  const matches: MatchedImage[] = [];
  let cursor = startIndex;

  for (const localFileName of localFiles) {
    while (cursor < cocoImages.length) {
      const cocoImage = cocoImages[cursor];
      const cocoBaseName = path.basename(cocoImage.file_name);
      cursor += 1;
      if (cocoBaseName === localFileName) {
        matches.push({ localFileName, cocoImage });
        break;
      }
    }
  }

  if (matches.length !== localFiles.length) {
    const missing = localFiles.filter((localFileName) => !matches.some((match) => match.localFileName === localFileName));
    throw new Error(`Nao foi possivel mapear todas as imagens de ${patientFolder}: ${missing.join(', ')}`);
  }

  return { matches, nextIndex: cursor };
};

const segmentationToPolygons = (segmentation: unknown): number[][] => {
  if (!Array.isArray(segmentation)) {
    return [];
  }

  return segmentation.filter((polygon): polygon is number[] => Array.isArray(polygon) && polygon.every((value) => typeof value === 'number'));
};

const polygonPoints = (polygon: number[]) => polygon
  .reduce<string[]>((points, value, index) => {
    if (index % 2 === 0 && index + 1 < polygon.length) {
      points.push(`${polygon[index]},${polygon[index + 1]}`);
    }
    return points;
  }, [])
  .map((point) => escapeXml(point))
  .join(' ');

const buildOverlaySvg = (
  width: number,
  height: number,
  annotations: CocoAnnotation[],
  categoryNames: Map<number, string>,
) => {
  const polygons = annotations
    .flatMap((annotation) => {
      const categoryName = categoryNames.get(annotation.category_id) ?? 'unknown';
      const style = OVERLAY_STYLES[categoryName] ?? { fill: '#ffffff22', stroke: '#ffffff' };
      return segmentationToPolygons(annotation.segmentation).map((polygon) => (
        `<polygon points="${polygonPoints(polygon)}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="3" />`
      ));
    })
    .join('');

  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${polygons}</svg>`,
  );
};

const buildMaskSvg = (width: number, height: number, annotations: CocoAnnotation[]) => {
  const polygons = annotations
    .flatMap((annotation) => segmentationToPolygons(annotation.segmentation))
    .map((polygon) => `<polygon points="${polygonPoints(polygon)}" fill="#ffffff" stroke="#ffffff" stroke-width="1" />`)
    .join('');

  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000000" />${polygons}</svg>`,
  );
};

const writeManifest = (patientFolder: string, manifest: ManifestEntry[]) => {
  const outputDir = path.join(ANNOTATIONS_ROOT, patientFolder);
  mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `DCIS.${patientFolder}.2.json`);
  writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return filePath;
};

const ensureDerivedDirectories = (patientFolder: string) => {
  mkdirSync(path.join(IMAGES_ROOT, patientFolder), { recursive: true });
  mkdirSync(path.join(MASK_ROOT, patientFolder), { recursive: true });
};

const main = async () => {
  const coco = readJson<CocoFile>(COCO_PATH);
  const categoryNames = new Map(coco.categories.map((category) => [category.id, category.name]));
  const vesselCategoryIds = new Set(
    coco.categories
      .filter((category) => VESSEL_CATEGORY_NAMES.has(category.name))
      .map((category) => category.id),
  );
  const annotationsByImage = new Map<number, CocoAnnotation[]>();

  for (const annotation of coco.annotations) {
    const current = annotationsByImage.get(annotation.image_id) ?? [];
    current.push(annotation);
    annotationsByImage.set(annotation.image_id, current);
  }

  const summary: Record<string, { manifest: number; annotatedImages: number; masks: number; vessels: number }> = {};
  let cursor = 0;

  for (const patientFolder of listPatientFolders()) {
    const { matches, nextIndex } = matchPatientFiles(patientFolder, coco.images, cursor);
    cursor = nextIndex;

    const manifest = matches.map(({ localFileName, cocoImage }) => toManifestEntry(localFileName, cocoImage));
    writeManifest(patientFolder, manifest);
    ensureDerivedDirectories(patientFolder);

    let vesselCount = 0;
    for (const match of matches) {
      const rawPath = path.join(IMAGES_RAW_ROOT, patientFolder, match.localFileName);
      const outputBaseName = `${path.basename(match.localFileName, path.extname(match.localFileName))}_rgb_labels.png`;
      const annotatedPath = path.join(IMAGES_ROOT, patientFolder, outputBaseName);
      const maskPath = path.join(MASK_ROOT, patientFolder, outputBaseName);
      const allAnnotations = annotationsByImage.get(match.cocoImage.id) ?? [];
      const vesselAnnotations = allAnnotations.filter((annotation) => vesselCategoryIds.has(annotation.category_id));
      vesselCount += vesselAnnotations.length;

      const overlaySvg = buildOverlaySvg(match.cocoImage.width, match.cocoImage.height, allAnnotations, categoryNames);
      const overlayPng = await sharp(overlaySvg, { density: 72 }).png().toBuffer();
      await sharp(rawPath)
        .composite([{ input: overlayPng, blend: 'over' }])
        .png()
        .toFile(annotatedPath);

      const maskSvg = buildMaskSvg(match.cocoImage.width, match.cocoImage.height, vesselAnnotations);
      await sharp(maskSvg, { density: 72 })
        .png()
        .toFile(maskPath);
    }

    summary[patientFolder] = {
      manifest: manifest.length,
      annotatedImages: matches.length,
      masks: matches.length,
      vessels: vesselCount,
    };
  }

  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
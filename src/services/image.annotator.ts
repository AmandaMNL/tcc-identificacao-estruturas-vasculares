import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

type VascularStructure = {
  id: string | null;
  label?: string;
  x: number;
  y: number;
  confidence: number;
};

type Point = {
  x: number;
  y: number;
};

type CoordinatesPayload = {
  vascular_structures: VascularStructure[];
  tumor_boundaries: Point[];
};

const escapeXml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const strokeColorForLabel = (label?: string): string => {
  switch ((label ?? '').trim()) {
    case 'not dilated vessel':
      return '#00e676';
    case 'Intermediately dilated vessel':
      return '#ffd600';
    case 'highly dilated vessel':
      return '#ff5252';
    case 'CCL21+':
      return '#40c4ff';
    default:
      return '#00e676';
  }
};

const detectImageExtension = (buffer: Buffer): string => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }

  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }

  return 'bin';
};

export class ImageAnnotatorService {
  async annotateFromCoordinates(
    sourceImageBase64: string,
    payload: CoordinatesPayload,
  ): Promise<string> {
    const sourceBuffer = Buffer.from(sourceImageBase64, 'base64');
    const image = sharp(sourceBuffer, { failOn: 'none' });
    const metadata = await image.metadata();

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width <= 0 || height <= 0) {
      throw new Error('Nao foi possivel obter dimensoes da imagem para anotacao.');
    }

    const vesselMarks = payload.vascular_structures
      .map((structure) => {
        const cx = clamp(structure.x, 0, width);
        const cy = clamp(structure.y, 0, height);
        const confidence = clamp(structure.confidence, 0, 1);
        const radius = 4 + confidence * 6;
        const stroke = strokeColorForLabel(structure.label);

        return `<circle cx="${cx}" cy="${cy}" r="${radius.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="2" />`;
      })
      .join('');

    const tumorPolyline = payload.tumor_boundaries.length > 1
      ? `<polyline points="${payload.tumor_boundaries
        .map((point) => `${clamp(point.x, 0, width)},${clamp(point.y, 0, height)}`)
        .map((point) => escapeXml(point))
        .join(' ')}" fill="none" stroke="#ff1744" stroke-width="2" />`
      : '';

    const overlaySvg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${vesselMarks}
        ${tumorPolyline}
      </svg>
    `;

    const outputBuffer = await image
      .composite([
        {
          input: Buffer.from(overlaySvg),
          blend: 'over',
        },
      ])
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    return outputBuffer.toString('base64');
  }

  saveBase64Image(base64: string, prefix = 'response'): string {
    const outputDir = path.resolve(process.cwd(), 'src/response');
    mkdirSync(outputDir, { recursive: true });

    const buffer = Buffer.from(base64, 'base64');
    const extension = detectImageExtension(buffer);
    const fileName = `${prefix}-${Date.now()}.${extension}`;
    const outputPath = path.join(outputDir, fileName);

    writeFileSync(outputPath, buffer);

    return outputPath;
  }
}

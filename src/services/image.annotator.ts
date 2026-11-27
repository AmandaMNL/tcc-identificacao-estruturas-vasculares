import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

type VascularStructure = {
  id: string | number | null;
  label?: string;
  confidence: number;
  contour_points: Point[];
  x?: number;
  y?: number;
};

const contourToSvgPoints = (points: Point[], width: number, height: number): string => {
  return points
    .map((point) => `${clamp(point.x, 0, width)},${clamp(point.y, 0, height)}`)
    .join(' ');
};

const polygonArea = (points: Point[]): number => {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
};

const boundingBoxForPoints = (points: Point[]) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

const expandContourIfTiny = (points: Point[], width: number, height: number): Point[] => {
  if (!Array.isArray(points) || points.length < 3) {
    return points;
  }

  const box = boundingBoxForPoints(points);
  const boxWidth = box.maxX - box.minX;
  const boxHeight = box.maxY - box.minY;
  const minSize = 12;

  // Preserva o contorno do LLM; só garante tamanho mínimo visível para contornos degenerados.
  if (polygonArea(points) > 0 && boxWidth >= minSize && boxHeight >= minSize) {
    return points;
  }

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const rx = Math.max(minSize, boxWidth) / 2;
  const ry = Math.max(minSize, boxHeight) / 2;
  const steps = 16;

  return Array.from({ length: steps }, (_, index) => {
    const angle = (Math.PI * 2 * index) / steps;

    return {
      x: clamp(cx + Math.cos(angle) * rx, 0, width),
      y: clamp(cy + Math.sin(angle) * ry, 0, height),
    };
  });
};

const anchorPointForContour = (points: Point[], width: number, height: number): Point | null => {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  const anchor = points[0];

  return {
    x: clamp(anchor.x + 6, 0, width),
    y: clamp(anchor.y - 6, 0, height),
  };
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
        const confidence = clamp(structure.confidence, 0, 1);
        const stroke = strokeColorForLabel(structure.label);
        const normalizedContour = Array.isArray(structure.contour_points) && structure.contour_points.length >= 3
          ? expandContourIfTiny(structure.contour_points, width, height)
          : typeof structure.x === 'number' && typeof structure.y === 'number'
            ? expandContourIfTiny([
              { x: structure.x - 10, y: structure.y - 10 },
              { x: structure.x + 10, y: structure.y - 10 },
              { x: structure.x + 10, y: structure.y + 10 },
              { x: structure.x - 10, y: structure.y + 10 },
            ], width, height)
            : [];

        const polygonPoints = contourToSvgPoints(normalizedContour, width, height);

        if (!polygonPoints) {
          return '';
        }

        const fillOpacity = (0.18 + (confidence * 0.18)).toFixed(2);
        const anchor = anchorPointForContour(normalizedContour, width, height) ?? { x: 0, y: 0 };
        const labelText = escapeXml(`${structure.label ?? 'vessel'} ${confidence.toFixed(2)}`);

        return `
          <g>
            <polygon points="${polygonPoints}" fill="${stroke}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" data-confidence="${confidence.toFixed(2)}" />
            <rect x="${anchor.x}" y="${Math.max(0, anchor.y - 18)}" width="180" height="20" rx="4" fill="rgba(0,0,0,0.55)" />
            <text x="${anchor.x + 5}" y="${Math.max(12, anchor.y - 4)}" fill="#ffffff" font-size="12" font-family="sans-serif">${labelText}</text>
          </g>
        `;
      })
      .join('');

    const tumorPolyline = payload.tumor_boundaries.length > 1
      ? `<polyline points="${escapeXml(contourToSvgPoints(payload.tumor_boundaries, width, height))}" fill="none" stroke="#35c6ff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" />`
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
    const outputDir = path.resolve(process.cwd(), 'response');
    mkdirSync(outputDir, { recursive: true });

    const buffer = Buffer.from(base64, 'base64');
    const extension = detectImageExtension(buffer);
    const fileName = `${prefix}-${Date.now()}.${extension}`;
    const outputPath = path.join(outputDir, fileName);

    writeFileSync(outputPath, buffer);

    return outputPath;
  }
}

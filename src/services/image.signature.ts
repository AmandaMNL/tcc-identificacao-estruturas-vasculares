const SIGNATURE_BANDS = 8;

export type ImageSignature = {
  byteLength: number;
  mean: number;
  std: number;
  bands: number[];
};

const normalizeBase64 = (rawBase64: string): string => {
  return rawBase64
    .trim()
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
    .replace(/\s+/g, '');
};

const round = (value: number): number => {
  return Math.round(value * 1e6) / 1e6;
};

export const getImageSignatureFromBuffer = (buffer: Buffer, bands = SIGNATURE_BANDS): ImageSignature => {
  if (buffer.length === 0) {
    throw new Error('Imagem vazia: nao foi possivel gerar assinatura visual.');
  }

  const total = buffer.length;
  let sum = 0;

  for (let index = 0; index < total; index += 1) {
    sum += buffer[index];
  }

  const mean = sum / total;
  let varianceAcc = 0;

  for (let index = 0; index < total; index += 1) {
    const delta = buffer[index] - mean;
    varianceAcc += delta * delta;
  }

  const std = Math.sqrt(varianceAcc / total);
  const bandCount = Math.max(1, Math.trunc(bands));
  const bandMeans: number[] = [];

  for (let band = 0; band < bandCount; band += 1) {
    const start = Math.floor((band * total) / bandCount);
    const endExclusive = Math.max(start + 1, Math.floor(((band + 1) * total) / bandCount));

    let bandSum = 0;
    let bandLength = 0;

    for (let index = start; index < endExclusive && index < total; index += 1) {
      bandSum += buffer[index];
      bandLength += 1;
    }

    bandMeans.push(round(bandSum / Math.max(1, bandLength)));
  }

  return {
    byteLength: total,
    mean: round(mean),
    std: round(std),
    bands: bandMeans,
  };
};

export const getImageSignatureFromBase64 = (base64: string): ImageSignature => {
  const normalized = normalizeBase64(base64);

  if (!normalized) {
    throw new Error('imageBase64 is required to generate visual signature.');
  }

  return getImageSignatureFromBuffer(Buffer.from(normalized, 'base64'));
};

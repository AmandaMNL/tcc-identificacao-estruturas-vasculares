import { z } from 'zod';
import { getSystemPrompt, getUserPromptTemplate } from '../../prompts/image.analiser.ts';
import type { StructuredLlmService } from '../../services/openrouter.service.ts';
import type { RagService } from '../../services/rag.service.ts';
import type { GraphState } from '../graph.ts';
import config from '../../config.ts';

const BASE64_CHARS_ONLY = /^[A-Za-z0-9+/=]+$/;

const looksLikeImageBuffer = (buffer: Buffer): boolean => {
  if (buffer.length < 4) {
    return false;
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

  return isJpeg || isPng;
};

const extractCandidateBase64 = (raw: string): string | null => {
  const normalized = raw
    .trim()
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
    .replace(/\s+/g, '');

  if (!normalized) {
    return null;
  }

  const jpegStart = normalized.indexOf('/9j/');
  const jpegEnd = normalized.lastIndexOf('/9k=');

  if (jpegStart >= 0 && jpegEnd >= jpegStart) {
    return normalized.slice(jpegStart, jpegEnd + 4);
  }

  const pngStart = normalized.indexOf('iVBOR');
  const pngEndMarker = 'SUVORK5CYII=';
  const pngEnd = normalized.lastIndexOf(pngEndMarker);

  if (pngStart >= 0 && pngEnd >= pngStart) {
    return normalized.slice(pngStart, pngEnd + pngEndMarker.length);
  }

  return normalized;
};

const normalizeAndValidateImageBase64 = (raw: string): string | null => {
  const candidate = extractCandidateBase64(raw);

  if (!candidate || !BASE64_CHARS_ONLY.test(candidate)) {
    return null;
  }

  const buffer = Buffer.from(candidate, 'base64');

  if (!looksLikeImageBuffer(buffer)) {
    return null;
  }

  return candidate;
};

const vascularStructureSchema = z.object({
  id: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  confidence: z.number().min(0).max(1),
});

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const summarySchema = z.object({
  summary: z.string().min(1),
  has_vascular_structures: z.boolean(),
});

const coordinatesResponseSchema = summarySchema.extend({
  vascular_structures: z.array(vascularStructureSchema),
  tumor_boundaries: z.array(pointSchema),
});

const imageResponseSchema = summarySchema
  .extend({
    annotated_image_base64: z.string().nullable(),
    image: z.string().nullable(),
  })
  .transform((data, ctx) => {
    const rawBase64 = (data.annotated_image_base64 ?? data.image ?? '').toString().trim();

    const normalizedBase64 = normalizeAndValidateImageBase64(rawBase64);

    if (!normalizedBase64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'annotated_image_base64 is missing or invalid (corrupted base64 image payload).',
      });

      return z.NEVER;
    }

    return {
      summary: data.summary,
      has_vascular_structures: data.has_vascular_structures,
      annotated_image_base64: normalizedBase64,
    };
  });

type LlmResponseDependencies = {
  llmClient: StructuredLlmService;
  ragService: Pick<RagService, 'getImageContext'>;
};

export function llmResponse(dependencies: LlmResponseDependencies) {
  const sendImageToLlm = config.sendImageToLlm;
  const topK = config.topK;

  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const systemPrompt = getSystemPrompt();
    const ragContext = await dependencies.ragService.getImageContext(state.imageSignature, topK);
    const userPrompt = getUserPromptTemplate(ragContext.promptContext, {
      sendImageToLlm,
    });
    const responseSchema = sendImageToLlm ? imageResponseSchema : coordinatesResponseSchema;

    const result = sendImageToLlm
      ? await dependencies.llmClient.generateStructuredFromImage(
        systemPrompt,
        userPrompt,
        state.imageBase64,
        responseSchema,
        state.imageMimeType,
      )
      : await dependencies.llmClient.generateStructured(
        systemPrompt,
        userPrompt,
        responseSchema,
      );

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      content: ragContext.promptContext,
      llmResponse: JSON.stringify(result.data),
    };
  };
}

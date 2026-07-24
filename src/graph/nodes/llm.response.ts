import { z } from 'zod';
import { getSystemPrompt, getUserPromptTemplate } from '../../prompts/image.analiser.ts';
import type { ImageService } from '../../services/image.service.ts';
import type { StructuredLlmService } from '../../services/openrouter.service.ts';
import type { GraphState } from '../graph.ts';
import config from '../../config.ts';

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

const responseSchema = z
  .object({
    vascular_structures: z.array(vascularStructureSchema),
    tumor_boundaries: z.array(pointSchema),
    has_vascular_structures: z.boolean(),
    annotated_image_base64: z.string().nullable(),
    image: z.string().nullable(),
  })
  .transform((data, ctx) => {
    const rawBase64 = (data.annotated_image_base64 ?? data.image ?? '').toString().trim();

    if (!rawBase64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'annotated_image_base64 is required in LLM response.',
      });

      return z.NEVER;
    }

    const normalizedBase64 = rawBase64
      .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
      .replace(/\s+/g, '');

    return {
      vascular_structures: data.vascular_structures,
      tumor_boundaries: data.tumor_boundaries,
      has_vascular_structures: data.has_vascular_structures,
      annotated_image_base64: normalizedBase64,
    };
  });

type LlmResponseDependencies = {
  llmClient: StructuredLlmService;
  imageService: Pick<ImageService, 'resolveMimeType'>;
};

export function llmResponse(dependencies: LlmResponseDependencies) {
  const sendImageToLlm = config.sendImageToLlm;

  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const systemPrompt = getSystemPrompt();
    const userPrompt = getUserPromptTemplate(state.content);
    const result = sendImageToLlm
      ? await dependencies.llmClient.generateStructuredFromImage(
        systemPrompt,
        userPrompt,
        state.imageBase64,
        responseSchema,
        dependencies.imageService.resolveMimeType(state.imagePath),
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
      llmResponse: JSON.stringify(result.data),
    };
  };
}

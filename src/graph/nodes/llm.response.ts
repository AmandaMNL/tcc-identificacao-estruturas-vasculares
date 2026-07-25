import { z } from 'zod';
import { getSystemPrompt, getUserPromptTemplate } from '../../prompts/image.analiser.ts';
import type { StructuredLlmService } from '../../services/openrouter.service.ts';
import type { RagService } from '../../services/rag.service.ts';
import type { GraphState } from '../graph.ts';
import config from '../../config.ts';

const vascularStructureSchema = z.object({
  id: z.string().nullable(),
  label: z.string().min(1),
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

type LlmResponseDependencies = {
  llmClient: StructuredLlmService;
  ragService: Pick<RagService, 'getImageContext'>;
};

export function llmResponse(dependencies: LlmResponseDependencies) {
  const sendImageToLlm = config.sendImageToLlm;
  const topK = config.topK;

  return async (state: GraphState): Promise<Partial<GraphState>> => {
    try {
      const systemPrompt = getSystemPrompt();
      const ragContext = await dependencies.ragService.getImageContext(state.imageSignature, topK);
      const userPrompt = getUserPromptTemplate(ragContext.promptContext, {
        sendImageToLlm,
      });
      const responseSchema = coordinatesResponseSchema;

      const result = sendImageToLlm
        ? await dependencies.llmClient.generateStructuredFromImage(
          systemPrompt,
          userPrompt,
          state.imageBase64,
          responseSchema,
          state.imageMimeType,
          ragContext.referenceImages,
        )
        : await dependencies.llmClient.generateStructured(
          systemPrompt,
          userPrompt,
          responseSchema,
        );

      if (!result.success) {
        return {
          content: ragContext.promptContext,
          responseError: result.error ?? 'LLM response failed.',
          llmResponse: JSON.stringify({
            error: result.error ?? 'LLM response failed.',
          }),
        };
      }

      return {
        content: ragContext.promptContext,
        responseError: '',
        llmResponse: JSON.stringify(result.data),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        responseError: message,
        llmResponse: JSON.stringify({ error: message }),
      };
    }
  };
}

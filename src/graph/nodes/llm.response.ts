import { z } from 'zod';
import { getSystemPrompt, getUserPromptTemplate } from '../../prompts/image.analiser.ts';
import type { StructuredLlmService } from '../../services/openrouter.service.ts';
import type { RagService } from '../../services/rag.service.ts';
import type { GraphState } from '../graph.ts';
import config from '../../config.ts';

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const vascularStructureSchema = z.object({
  id: z.union([z.string(), z.number()]).nullable(),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  contour_points: z.array(pointSchema).min(1),
});

const summarySchema = z.object({
  summary: z.string().min(1),
  has_vascular_structures: z.boolean(),
  image_width: z.number().int().positive(),
  image_height: z.number().int().positive(),
});

const coordinatesResponseSchema = summarySchema.extend({
  vascular_structures: z.array(vascularStructureSchema),
  tumor_boundaries: z.array(pointSchema),
});

const annotatedImageResponseSchema = summarySchema.extend({
  annotated_image_base64: z.string().min(1),
});

type LlmResponseDependencies = {
  llmClient: StructuredLlmService;
  ragService: Pick<RagService, 'getImageContext'>;
  sendImageToLlm: boolean;
  receivedImage: boolean;
};

export function llmResponse(dependencies: LlmResponseDependencies) {
  const topK = config.topK;

  return async (state: GraphState): Promise<Partial<GraphState>> => {
    try {
      const systemPrompt = getSystemPrompt();
      const ragContext = await dependencies.ragService.getImageContext(state.imageSignature, topK);
      const userPrompt = getUserPromptTemplate(ragContext.promptContext, {
        sendImageToLlm: dependencies.sendImageToLlm,
        receivedImage: dependencies.receivedImage,
        imageWidth: state.imageWidth,
        imageHeight: state.imageHeight,
      });
      const responseSchema = dependencies.receivedImage
        ? annotatedImageResponseSchema
        : coordinatesResponseSchema;

      const shouldSendImage = dependencies.sendImageToLlm || dependencies.receivedImage;
      const result = shouldSendImage
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

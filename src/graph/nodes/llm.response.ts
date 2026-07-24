import { z } from 'zod';
import { getSystemPrompt, getUserPromptTemplate } from '../../prompts/image.analiser.ts';
import type { ImageService } from '../../services/image.service.ts';
import type { StructuredLlmService } from '../../services/openrouter.service.ts';
import type { GraphState } from '../graph.ts';
import config from '../../config.ts';

const responseSchema = z.object({
  summary: z.string(),
  vascular_findings: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  follow_up_questions: z.array(z.string()).min(1).max(3),
});

type LlmResponseDependencies = {
  llmClient: StructuredLlmService;
  imageService: Pick<ImageService, 'resolveMimeType'>;
};

export function llmResponse(dependencies: LlmResponseDependencies) {
  const sendImageToLlm = config.sendImageToLlm;

  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const systemPrompt = getSystemPrompt();
    const userPrompt = getUserPromptTemplate(state.question, state.content);
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

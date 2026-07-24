import path from 'node:path';
import { z } from 'zod';
import { getSystemPrompt, getUserPromptTemplate } from '../../prompts/image.analiser.ts';
import type { OpenRouterService } from '../../services/openrouter.service.ts';
import type { GraphState } from '../graph.ts';

const responseSchema = z.object({
  summary: z.string(),
  vascular_findings: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  follow_up_questions: z.array(z.string()).min(1).max(3),
});

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const resolveMimeType = (imagePath: string): string => {
  const ext = path.extname(imagePath).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'image/png';
};

const SEND_IMAGE_TO_LLM = (process.env.LLM_SEND_IMAGE ?? 'true').toLowerCase() === 'true';

export function llmResponse(llmClient: OpenRouterService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const systemPrompt = getSystemPrompt();
    const userPrompt = getUserPromptTemplate(state.question, state.content);
    const result = SEND_IMAGE_TO_LLM
      ? await llmClient.generateStructuredFromImage(
        systemPrompt,
        userPrompt,
        state.imageBase64,
        responseSchema,
        resolveMimeType(state.imagePath),
      )
      : await llmClient.generateStructured(
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

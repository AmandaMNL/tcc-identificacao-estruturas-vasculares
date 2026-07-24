import { START, END, StateGraph } from '@langchain/langgraph';
import type { OpenRouterService } from '../services/openrouter.service.ts';
import { z } from 'zod';
import { getImage } from './nodes/get.image.ts';
import { processImage } from './nodes/process.image.ts';
import { llmResponse } from './nodes/llm.response.ts';

export const schema = z.object({
  model: z.string().default('openai/gpt-5-image-mini'),
  imagePath: z.string(),
  imageBase64: z.string().default(''),
  content: z.string().default(''),
  question: z.string().default('Identify vascular structures present in this image.'),
  llmResponse: z.string().default(''),
});

export type GraphState = z.infer<typeof schema>;

export function buildGraph(
  llmClient: OpenRouterService,
  imagePath: string,
) {
  const workflow = new StateGraph({
    stateSchema: schema,
  })
    .addNode('getImage', getImage(imagePath))
    .addNode('processImage', processImage())
    .addNode('llmResponse', llmResponse(llmClient))

    .addEdge(START, 'getImage')
    .addEdge('getImage', 'processImage')
    .addEdge('processImage', 'llmResponse')
    .addEdge('llmResponse', END);

  return workflow.compile();
}
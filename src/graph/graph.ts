import { START, END, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { getImage } from './nodes/get.image.ts';
import { processImage } from './nodes/process.image.ts';
import { llmResponse } from './nodes/llm.response.ts';
import type { ImageService } from '../services/image.service.ts';
import type { ImageTransformService } from '../services/image.transform.ts';
import type { StructuredLlmService } from '../services/openrouter.service.ts';

export const schema = z.object({
  model: z.string().default('openai/gpt-5-image-mini'),
  imagePath: z.string(),
  imageBase64: z.string().default(''),
  content: z.string().default(''),
  question: z.string().default('Identify vascular structures present in this image.'),
  llmResponse: z.string().default(''),
});

export type GraphState = z.infer<typeof schema>;

export type GraphDependencies = {
  llmClient: StructuredLlmService;
  imageService: ImageService;
  imageTransformService: ImageTransformService;
  defaultImagePath?: string;
  topK?: number;
  sendImageToLlm?: boolean;
};

export function buildGraph(
  dependencies: GraphDependencies,
) {
  const workflow = new StateGraph({
    stateSchema: schema,
  })
    .addNode('getImage', getImage(dependencies.defaultImagePath ?? ''))
    .addNode('processImage', processImage({
      imageService: dependencies.imageService,
      imageTransformService: dependencies.imageTransformService,
    }))
    .addNode('generateLlmResponse', llmResponse({
      llmClient: dependencies.llmClient,
      imageService: dependencies.imageService,
    }))

    .addEdge(START, 'getImage')
    .addEdge('getImage', 'processImage')
    .addEdge('processImage', 'generateLlmResponse')
    .addEdge('generateLlmResponse', END);

  return workflow.compile();
}
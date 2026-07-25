import { START, END, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { getImage } from './nodes/get.image.ts';
import { processImage } from './nodes/process.image.ts';
import { llmResponse } from './nodes/llm.response.ts';
import { applyOverlay } from './nodes/apply.overlay.ts';
import { saveResult } from './nodes/save.result.ts';
import { responseNode } from './nodes/response.ts';
import type { StructuredLlmService } from '../services/openrouter.service.ts';
import type { RagService } from '../services/rag.service.ts';
import type { ImageAnnotatorService } from '../services/image.annotator.ts';

export const schema = z.object({
  model: z.string().default('openai/gpt-5-image-mini'),
  imageBase64: z.string().default(''),
  imageMimeType: z.string().default('image/png'),
  imageSignature: z.string().default(''),
  responseImagePath: z.string().default(''),
  responseError: z.string().default(''),
  content: z.string().default(''),
  question: z.string().default('Identify vascular structures present in this image.'),
  llmResponse: z.string().default(''),
});

export type GraphState = z.infer<typeof schema>;

export type GraphDependencies = {
  llmClient: StructuredLlmService;
  ragService: RagService;
  imageAnnotatorService: ImageAnnotatorService;
  topK?: number;
  sendImageToLlm?: boolean;
};

export function buildGraph(
  dependencies: GraphDependencies,
) {
  const routeAfterLlmResponse = (state: GraphState) => {
    return state.responseError?.trim() ? 'response' : 'applyOverlay';
  };

  const workflow = new StateGraph({
    stateSchema: schema,
  })
    .addNode('getImage', getImage())
    .addNode('processImage', processImage())
    .addNode('generateLlmResponse', llmResponse({
      llmClient: dependencies.llmClient,
      ragService: dependencies.ragService,
    }))
    .addNode('applyOverlay', applyOverlay({
      imageAnnotatorService: dependencies.imageAnnotatorService,
    }))
    .addNode('saveResult', saveResult({
      imageAnnotatorService: dependencies.imageAnnotatorService,
    }))
    .addNode('response', responseNode())

    .addEdge(START, 'getImage')
    .addEdge('getImage', 'processImage')
    .addEdge('processImage', 'generateLlmResponse')
    .addConditionalEdges('generateLlmResponse', routeAfterLlmResponse)
    .addEdge('applyOverlay', 'saveResult')
    .addEdge('saveResult', 'response')
    .addEdge('response', END);

  return workflow.compile();
}
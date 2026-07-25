import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildGraph } from '../src/graph/graph.ts';
import { RagService } from '../src/services/rag.service.ts';
import { OpenRouterService } from '../src/services/openrouter.service.ts';
import { ImageAnnotatorService } from '../src/services/image.annotator.ts';

test('graph should use image from data and prompt builders from image.analiser.ts', async () => {
  const imagePath = 'data/images/DCIS/Patient_001/10_rgb_labels.png';
  const imageBase64 = readFileSync(imagePath).toString('base64');

  const graph = buildGraph({
    llmClient: new OpenRouterService(),
    ragService: new RagService(),
    imageAnnotatorService: new ImageAnnotatorService(),
  });

  const result = await graph.invoke({
    imageBase64,
  });

  const parsedResponse = JSON.parse(result.llmResponse);
  console.log('Parsed LLM Response:', parsedResponse);
});

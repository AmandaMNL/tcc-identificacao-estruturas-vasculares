import test from 'node:test';
import { buildGraph } from '../src/graph/graph.ts';
import { ImageService } from '../src/services/image.service.ts';
import { ImageTransformService } from '../src/services/image.transform.ts';
import { OpenRouterService } from '../src/services/openrouter.service.ts';

test('graph should use image from data and prompt builders from image.analiser.ts', async () => {
  const imagePath = 'data/images/2_rgb_labels.png';

  const graph = buildGraph({
    llmClient: new OpenRouterService(),
    imageService: new ImageService(),
    imageTransformService: new ImageTransformService(),
  });

  const result = await graph.invoke({
    imagePath,
  });

  const parsedResponse = JSON.parse(result.llmResponse);
  console.log('Parsed LLM Response:', parsedResponse);
});

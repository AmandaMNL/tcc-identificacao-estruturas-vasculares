import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph } from '../src/graph/graph.ts';
import type { ImageService } from '../src/services/image.service.ts';
import type { ImageTransformResult, ImageTransformService } from '../src/services/image.transform.ts';
import type { StructuredLlmService } from '../src/services/openrouter.service.ts';

const mockImageService: Pick<ImageService, 'readAsBase64' | 'resolveMimeType'> = {
  readAsBase64: () => 'ZmFrZS1pbWFnZS1iYXNlNjQ=',
  resolveMimeType: () => 'image/png',
};

const mockImageTransformService: Pick<ImageTransformService, 'getImageContext'> = {
  getImageContext: async (imagePathOrFileName: string): Promise<ImageTransformResult> => ({
    fileName: imagePathOrFileName,
    image: {
      id: 2,
      file_name: imagePathOrFileName,
      width: 1934,
      height: 921,
    },
    tile: null,
    topCategories: [
      {
        categoryId: 1,
        categoryName: 'not dilated vessel',
        annotationCount: 42,
        totalArea: 5320,
      },
    ],
    topAnnotations: [
      {
        annotationId: 10,
        categoryId: 1,
        categoryName: 'not dilated vessel',
        area: 280,
        bboxJson: '[10, 10, 20, 20]',
        segmentationJson: '[[10, 10, 20, 20, 20, 10]]',
      },
    ],
    promptContext: JSON.stringify({
      file_name: imagePathOrFileName,
      top_categories: [{ categoryId: 1, categoryName: 'not dilated vessel' }],
    }),
  }),
};

const mockLlmService = {
  generateStructured: async (..._args: unknown[]) => ({
    success: true,
    data: {
      summary: 'Vascular structures identified.',
      vascular_findings: ['not dilated vessel'],
      confidence: 0.92,
      follow_up_questions: ['Is there a region of high dilation?'],
    },
  }),
  generateStructuredFromImage: async (..._args: unknown[]) => ({
    success: true,
    data: {
      summary: 'Vascular structures identified from image and context.',
      vascular_findings: ['not dilated vessel'],
      confidence: 0.95,
      follow_up_questions: ['Can you provide another tile from the same area?'],
    },
  }),
} as unknown as StructuredLlmService;

test('graph should process image and prompt and return llmResponse', async () => {
  const graph = buildGraph({
    llmClient: mockLlmService,
    imageService: mockImageService as ImageService,
    imageTransformService: mockImageTransformService as ImageTransformService,
  });

  const result = await graph.invoke({
    imagePath: 'data/images/2.png',
    question: 'Identify vascular structures present in this image.',
  });

  assert.equal(result.imagePath, 'data/images/2.png');
  assert.ok(result.content.length > 0);

  const parsedResponse = JSON.parse(result.llmResponse);
  assert.equal(parsedResponse.summary, 'Vascular structures identified from image and context.');
  assert.equal(parsedResponse.vascular_findings[0], 'not dilated vessel');
});

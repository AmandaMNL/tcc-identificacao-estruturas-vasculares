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
      vascular_structures: [
        {
          id: 'v1',
          x: 10,
          y: 20,
          confidence: 0.92,
        },
      ],
      tumor_boundaries: [{ x: 5, y: 5 }],
      has_vascular_structures: true,
      annotated_image_base64: 'ZmFrZS1hbm5vdGF0ZWQtaW1hZ2U=',
    },
  }),
  generateStructuredFromImage: async (..._args: unknown[]) => ({
    success: true,
    data: {
      vascular_structures: [
        {
          id: 'v1',
          x: 15,
          y: 25,
          confidence: 0.95,
        },
      ],
      tumor_boundaries: [{ x: 6, y: 6 }],
      has_vascular_structures: true,
      annotated_image_base64: 'ZmFrZS1hbm5vdGF0ZWQtaW1hZ2UtZnJvbS1sbG0=',
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
  assert.equal(parsedResponse.has_vascular_structures, true);
  assert.equal(parsedResponse.vascular_structures[0].id, 'v1');
  assert.equal(parsedResponse.annotated_image_base64, 'ZmFrZS1hbm5vdGF0ZWQtaW1hZ2UtZnJvbS1sbG0=');
});

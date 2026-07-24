import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph } from '../src/graph/graph.ts';
import type { StructuredLlmService } from '../src/services/openrouter.service.ts';
import type { RagService } from '../src/services/rag.service.ts';

const mockRagService: Pick<RagService, 'getImageContext'> = {
  getImageContext: async (imagePathOrFileName: string) => ({
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
      summary: 'Resumo objetivo dos achados vasculares.',
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
    },
  }),
  generateStructuredFromImage: async (..._args: unknown[]) => ({
    success: true,
    data: {
      summary: 'Resumo com imagem anotada.',
      has_vascular_structures: true,
      annotated_image_base64: 'ZmFrZS1hbm5vdGF0ZWQtaW1hZ2UtZnJvbS1sbG0=',
      image: null,
    },
  }),
} as unknown as StructuredLlmService;

test('graph should process image and prompt and return llmResponse', async () => {
  const graph = buildGraph({
    llmClient: mockLlmService,
    ragService: mockRagService as RagService,
  });

  const result = await graph.invoke({
    imageBase64: 'ZmFrZS1pbWFnZS1iYXNlNjQ=',
    question: 'Identify vascular structures present in this image.',
  });

  assert.equal(result.imageBase64, 'ZmFrZS1pbWFnZS1iYXNlNjQ=');
  assert.ok(result.content.length > 0);

  const parsedResponse = JSON.parse(result.llmResponse);
  assert.equal(typeof parsedResponse.summary, 'string');
  assert.ok(parsedResponse.summary.length > 0);
  assert.equal(parsedResponse.has_vascular_structures, true);

  if (parsedResponse.annotated_image_base64) {
    assert.equal(typeof parsedResponse.annotated_image_base64, 'string');
    assert.ok(parsedResponse.annotated_image_base64.length > 0);
  } else {
    assert.equal(parsedResponse.vascular_structures[0].id, 'v1');
    assert.equal(parsedResponse.tumor_boundaries[0].x, 5);
  }
});

test('graph should accept base64-only input for proximity RAG retrieval', async () => {
  const graph = buildGraph({
    llmClient: mockLlmService,
    ragService: mockRagService as RagService,
  });

  const result = await graph.invoke({
    imageBase64: 'ZmFrZS1pbnB1dC1pbWFnZS1iYXNlNjQ=',
    question: 'Identifique estruturas vasculares.',
  });

  assert.equal(result.imageBase64, 'ZmFrZS1pbnB1dC1pbWFnZS1iYXNlNjQ=');
  assert.ok(result.content.length > 0);

  const parsedResponse = JSON.parse(result.llmResponse);
  assert.equal(typeof parsedResponse.summary, 'string');
  assert.ok(parsedResponse.summary.length > 0);

  if (parsedResponse.annotated_image_base64) {
    assert.equal(typeof parsedResponse.annotated_image_base64, 'string');
    assert.ok(parsedResponse.annotated_image_base64.length > 0);
  } else {
    assert.equal(Array.isArray(parsedResponse.vascular_structures), true);
  }
});

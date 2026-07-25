import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph } from '../src/graph/graph.ts';
import type { StructuredLlmService } from '../src/services/openrouter.service.ts';
import type { RagService } from '../src/services/rag.service.ts';
import type { ImageAnnotatorService } from '../src/services/image.annotator.ts';

const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotkWAAAAAASUVORK5CYII=';

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
    referenceImages: [],
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
      image_width: 1934,
      image_height: 917,
      vascular_structures: [
        {
          id: 'v1',
          label: 'not dilated vessel',
          confidence: 0.92,
          contour_points: [
            { x: 8, y: 18 },
            { x: 12, y: 18 },
            { x: 12, y: 22 },
            { x: 8, y: 22 },
          ],
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
      image_width: 1934,
      image_height: 917,
      annotated_image_base64: 'aW1hZ2VtLWFub3RhZGE=',
    },
  }),
} as unknown as StructuredLlmService;

const mockImageAnnotatorService: Pick<ImageAnnotatorService, 'annotateFromCoordinates' | 'saveBase64Image'> = {
  annotateFromCoordinates: async () => 'bG9jYWwtaW1hZ2UtYW5ub3RhdGlvbi1iYXNlNjQ=',
  saveBase64Image: () => 'src/response/test-output.jpg',
};

const failingLlmService = {
  generateStructured: async () => ({
    success: false,
    error: 'forced llm error',
  }),
  generateStructuredFromImage: async () => ({
    success: false,
    error: 'forced llm image error',
  }),
} as unknown as StructuredLlmService;

test('graph should process image and prompt and return llmResponse', async () => {
  const graph = buildGraph({
    llmClient: mockLlmService,
    ragService: mockRagService as RagService,
    imageAnnotatorService: mockImageAnnotatorService as ImageAnnotatorService,
    sendImageToLlm: true,
    receivedImage: false,
  });

  const result = await graph.invoke({
    imageBase64: VALID_PNG_BASE64,
    question: 'Identify vascular structures present in this image.',
  });

  assert.ok(result.imageBase64.length > 0);
  assert.equal(result.responseImagePath, 'src/response/test-output.jpg');
  assert.ok(result.content.length > 0);

  const parsedResponse = JSON.parse(result.llmResponse);
  assert.equal(typeof parsedResponse.summary, 'string');
  assert.ok(parsedResponse.summary.length > 0);
  assert.equal(parsedResponse.has_vascular_structures, true);
  assert.equal(parsedResponse.image_width, 1934);
  assert.equal(parsedResponse.image_height, 917);

  assert.equal(typeof parsedResponse.annotated_image_base64, 'string');
  assert.ok(parsedResponse.annotated_image_base64.length > 0);
  assert.equal(Boolean(result.responseJsonPath), true);
});

test('graph should accept base64-only input for proximity RAG retrieval', async () => {
  const graph = buildGraph({
    llmClient: mockLlmService,
    ragService: mockRagService as RagService,
    imageAnnotatorService: mockImageAnnotatorService as ImageAnnotatorService,
    sendImageToLlm: true,
    receivedImage: false,
  });

  const result = await graph.invoke({
    imageBase64: VALID_PNG_BASE64,
    question: 'Identifique estruturas vasculares.',
  });

  assert.ok(result.imageBase64.length > 0);
  assert.equal(result.responseImagePath, 'src/response/test-output.jpg');
  assert.ok(result.content.length > 0);

  const parsedResponse = JSON.parse(result.llmResponse);
  assert.equal(typeof parsedResponse.summary, 'string');
  assert.ok(parsedResponse.summary.length > 0);
  assert.equal(parsedResponse.image_width, 1934);
  assert.equal(parsedResponse.image_height, 917);

  assert.equal(typeof parsedResponse.annotated_image_base64, 'string');
  assert.ok(parsedResponse.annotated_image_base64.length > 0);
});

test('graph should skip overlay and saveResult path when llm response fails', async () => {
  const graph = buildGraph({
    llmClient: failingLlmService,
    ragService: mockRagService as RagService,
    imageAnnotatorService: mockImageAnnotatorService as ImageAnnotatorService,
    sendImageToLlm: true,
    receivedImage: false,
  });

  const result = await graph.invoke({
    imageBase64: VALID_PNG_BASE64,
    question: 'Identifique estruturas vasculares.',
  });

  assert.equal(result.responseError, 'forced llm image error');
  assert.equal(Boolean(result.responseImagePath), false);

  const parsedResponse = JSON.parse(result.llmResponse);
  assert.equal(parsedResponse.error, 'forced llm image error');
});

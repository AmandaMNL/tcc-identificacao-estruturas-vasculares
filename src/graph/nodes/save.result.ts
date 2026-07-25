import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GraphState } from '../graph.ts';
import type { ImageAnnotatorService } from '../../services/image.annotator.ts';

type SaveResultDependencies = {
  imageAnnotatorService: Pick<ImageAnnotatorService, 'saveBase64Image'>;
};

type SaveablePayload = {
  annotated_image_base64?: string;
};

const saveJsonToResponseFolder = (responseImagePath: string, payload: unknown): string => {
  const parsedPath = path.parse(responseImagePath);
  const jsonPath = path.join(parsedPath.dir, `${parsedPath.name}.json`);

  mkdirSync(parsedPath.dir, { recursive: true });

  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');

  return jsonPath;
};

export function saveResult(dependencies: SaveResultDependencies) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    if (!state.llmResponse?.trim()) {
      return {};
    }

    const parsed = JSON.parse(state.llmResponse) as SaveablePayload;

    if (!parsed.annotated_image_base64) {
      return {};
    }

    const responseImagePath = dependencies.imageAnnotatorService.saveBase64Image(
      parsed.annotated_image_base64,
      'response',
    );

    const responseJsonPath = saveJsonToResponseFolder(responseImagePath, parsed);

    return {
      responseImagePath,
      responseJsonPath,
    };
  };
}

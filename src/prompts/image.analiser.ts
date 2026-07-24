import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const COCO_PATH = path.resolve(process.cwd(), 'data/annotations/COCO_annotations.json');
const DCIS_PATH = path.resolve(process.cwd(), 'data/annotations/DCIS.Patient_001.2.json');
const MAX_CHARS_PER_ANNOTATION_FILE = 12000;

const readFileText = (filePath: string) => {
  if (!existsSync(filePath)) {
    return `Arquivo nao encontrado: ${filePath}`;
  }

  return readFileSync(filePath, 'utf-8');
};

const truncateText = (text: string, maxChars: number) => {
  if (text.length <= maxChars) {
    return text;
  }

  const omittedChars = text.length - maxChars;
  const marker = `[TRUNCATED: ${omittedChars} chars omitted to fit model context.]`;
  const availableChars = maxChars - marker.length;

  if (availableChars <= 0) {
    return marker;
  }

  const headChars = Math.floor(availableChars / 2);
  const tailChars = availableChars - headChars;
  const head = text.slice(0, headChars);
  const tail = text.slice(-tailChars);

  return `${head}\n\n${marker}\n\n${tail}`;
};

export const getSystemPrompt = () => {
  const cocoAnnotationsText = truncateText(
    readFileText(COCO_PATH),
    MAX_CHARS_PER_ANNOTATION_FILE,
  );
  const dcisAnnotationsText = truncateText(
    readFileText(DCIS_PATH),
    MAX_CHARS_PER_ANNOTATION_FILE,
  );

  return JSON.stringify({
    role: 'Analista de imagem para identificar padroes e estruturas vasculares em imagens medicas. Forneca respostas detalhadas, com base em dados, e siga as instrucoes abaixo.',
    rules: [
      'CRITICAL: Match the QUESTION language, NOT data language. English question = English answer, Portuguese question = Portuguese answer',
      'Write complete analytical responses using actual data (no placeholders)',
      'Include calculations: percentages, distributions, averages, comparisons',
      'Start with key finding, use bullets for lists, highlight patterns',
      'Provide 2-3 specific follow-up questions in the same language as the original question',
      'Do NOT include queries or apologize for errors',
    ],
    example: {
      // #sym:example
      annotation_files: {
        coco_annotations_json: cocoAnnotationsText,
        dcis_patient_001_2_json: dcisAnnotationsText,
      },
    },
  });
};

export const getUserPromptTemplate = (question: string, imageContext: string) => {
  return JSON.stringify({
    question,
    context_from_neo4j_topk: imageContext,
    instructions: [
      'Carefully analyze the image and prioritize vascular structure identification.',
      'Use the Neo4j context as supporting evidence, but trust the visual evidence from the image first.',
      'Report vessel-related findings with objective values when possible.',
      'Match the language of the question.',
      'Answer only in Portuguese, use utf-8 to avoid encoding issues.'
    ],
  });
};
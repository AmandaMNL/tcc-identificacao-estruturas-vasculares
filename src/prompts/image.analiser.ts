import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const COCO_PATH = path.resolve(process.cwd(), 'data/annotations/COCO_annotations.json');
const DCIS_PATH = path.resolve(process.cwd(), 'data/annotations/DCIS/Patient_001/DCIS.Patient_001.2.json');
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
      'Return valid JSON only. No markdown, no extra text, no code fences.',
      'Write complete analytical responses using actual data (no placeholders)',
      'Keep output compact and deterministic.',
      'Do NOT include queries or apologize for errors',
      'Use category labels consistent with the dataset when naming vascular structures.',
    ],
    example: {
      annotation_files: {
        coco_annotations_json: cocoAnnotationsText,
        dcis_patient_001_2_json: dcisAnnotationsText,
      },
    },
  });
};

type UserPromptOptions = {
  sendImageToLlm: boolean;
};

export const getUserPromptTemplate = (imageContext: string, options: UserPromptOptions) => {
  const question = options.sendImageToLlm
    ? 'Identifique as estruturas vasculares presentes na imagem consultada usando como apoio o contexto RAG e as imagens de referencia recuperadas. Responda SOMENTE em JSON compacto com este formato: {"summary":"...","has_vascular_structures":true,"vascular_structures":[{"id":null,"label":"not dilated vessel","x":0,"y":0,"confidence":0.0}],"tumor_boundaries":[{"x":0,"y":0}]}. O campo summary e obrigatorio e deve resumir os principais achados. Use em label categorias do dataset quando aplicavel, como not dilated vessel, Intermediately dilated vessel, highly dilated vessel ou CCL21+. Sempre retorne coordenadas de vascular_structures e tumor_boundaries quando houver. Sem texto extra fora do JSON. Se nao houver estruturas vasculares, retorne vascular_structures vazio, tumor_boundaries vazio e has_vascular_structures=false.'
    : 'Identifique as estruturas vasculares presentes na imagem com base no contexto RAG disponivel e responda SOMENTE em JSON compacto com este formato: {"summary":"...","has_vascular_structures":true,"vascular_structures":[{"id":null,"label":"not dilated vessel","x":0,"y":0,"confidence":0.0}],"tumor_boundaries":[{"x":0,"y":0}]}. O campo summary e obrigatorio e deve resumir os principais achados. Use em label categorias do dataset quando aplicavel, como not dilated vessel, Intermediately dilated vessel, highly dilated vessel ou CCL21+. Sempre retorne as coordenadas em vascular_structures e tumor_boundaries (quando houver). Sem texto extra fora do JSON. Se nao houver estruturas vasculares, retorne vascular_structures vazio, tumor_boundaries vazio e has_vascular_structures=false.';

  return JSON.stringify({
    role: 'professional lab technician',
    context_from_neo4j_topk: imageContext,
    instructions: [
      'Carefully analyze the image and prioritize vascular structure identification.',
      'Use the Neo4j context as supporting evidence, but trust the visual evidence from the image first.',
      'When reference artifacts are provided, compare the query image against imageRaw, labeled images, masks, and annotation metadata from the retrieved case.',
      'Report vessel-related findings with objective values when possible.',
      'Match the language of the question.',
      'Answer only in Portuguese, use utf-8 to avoid encoding issues.'
    ],
    question,
  });
};
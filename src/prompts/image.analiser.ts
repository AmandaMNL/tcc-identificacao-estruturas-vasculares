import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const COCO_PATH = path.resolve(process.cwd(), 'data/annotations/COCO_annotations.json');
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
        local_patient_manifest_json: 'Manifestos locais especificos do caso recuperado sao enviados dinamicamente no contexto RAG.',
      },
    },
  });
};

type UserPromptOptions = {
  sendImageToLlm: boolean;
  receivedImage: boolean;
  imageWidth: number;
  imageHeight: number;
};

export const getUserPromptTemplate = (imageContext: string, options: UserPromptOptions) => {
  const coordinateInstruction = `As coordenadas devem estar no espaco de pixels da imagem consultada, com origem no canto superior esquerdo, largura ${options.imageWidth} e altura ${options.imageHeight}. Nao use a escala, a posicao ou as coordenadas das imagens de referencia. Use as referencias apenas para comparar morfologia e padroes visuais.`;
  const annotatedImageInstruction = `Gere a imagem anotada diretamente e devolva-a em base64 no campo annotated_image_base64. Nao retorne pontos, poligonos ou overlay local. A imagem deve refletir a mesma area, escala e posicao da imagem consultada, com anotacoes visuais sobre as estruturas vasculares encontradas.`;
  const contourResponseInstruction = `Responda SOMENTE em JSON compacto com este formato: {"summary":"...","has_vascular_structures":true,"image_width":${options.imageWidth},"image_height":${options.imageHeight},"vascular_structures":[{"id":null,"label":"not dilated vessel","confidence":0.0,"contour_points":[{"x":0,"y":0}]}],"tumor_boundaries":[{"x":0,"y":0}]}. O campo summary e obrigatorio e deve resumir os principais achados. image_width e image_height sao obrigatorios e devem repetir exatamente a largura e a altura da imagem consultada. Use em label categorias do dataset quando aplicavel, como not dilated vessel, Intermediately dilated vessel, highly dilated vessel ou CCL21+. Cada vascular_structure deve trazer contour_points com varios pontos x/y descrevendo o contorno; use ao menos 3 pontos quando houver area visivel. Sem texto extra fora do JSON. Se nao houver estruturas vasculares, retorne vascular_structures vazio, tumor_boundaries vazio e has_vascular_structures=false.`;

  const question = options.receivedImage
    ? `Identifique as estruturas vasculares presentes na imagem consultada usando como apoio o contexto RAG e as imagens de referencia recuperadas. ${coordinateInstruction} ${annotatedImageInstruction} Responda SOMENTE em JSON compacto com este formato: {"summary":"...","has_vascular_structures":true,"image_width":${options.imageWidth},"image_height":${options.imageHeight},"annotated_image_base64":"..."}. O campo summary e obrigatorio e deve resumir os principais achados. image_width e image_height sao obrigatorios e devem repetir exatamente a largura e a altura da imagem consultada. annotated_image_base64 deve conter a imagem final anotada em base64, sem prefixo data URL. Use as referencias apenas como apoio visual e mantenha a anotacao sobre a imagem consultada. Se nao houver estruturas vasculares, ainda retorne a imagem consultada anotada com indicacao de ausencia ou com anotacao minima apropriada.`
    : options.sendImageToLlm
      ? `Identifique as estruturas vasculares presentes na imagem consultada usando como apoio o contexto RAG e as imagens de referencia recuperadas. ${coordinateInstruction} ${contourResponseInstruction}`
      : `Identifique as estruturas vasculares presentes na imagem com base apenas no contexto RAG disponivel e no texto recuperado. ${coordinateInstruction} ${contourResponseInstruction}`;

  return JSON.stringify({
    role: 'professional lab technician',
    context_from_neo4j_topk: imageContext,
    instructions: [
      'Carefully analyze the image and prioritize vascular structure identification.',
      'Use the Neo4j context as supporting evidence, but trust the visual evidence from the image first.',
      'When reference artifacts are provided, compare the query image against imageRaw, labeled images, masks, and annotation metadata from the retrieved case, but output coordinates only for the query image.',
      'Report vessel-related findings with objective values when possible.',
      'Match the language of the question.',
      'Answer only in Portuguese, use utf-8 to avoid encoding issues.'
    ],
    question,
  });
};
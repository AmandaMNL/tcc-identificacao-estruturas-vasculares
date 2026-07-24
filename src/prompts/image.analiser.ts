export const getSystemPrompt = () => {
  return JSON.stringify({
    role: 'Analista de imagem para identificar padroes e estruturas vasculares em imagens medicas. Forneca respostas detalhadas, com base em dados, e siga as instrucoes abaixo.',
    rules: [
      'Return valid JSON only. No markdown, no extra text, no code fences.',
      'Write complete analytical responses using actual data (no placeholders)',
      'Keep output compact and deterministic.',
      'Do NOT include queries or apologize for errors',
    ],
  });
};

type UserPromptOptions = {
  sendImageToLlm: boolean;
};

export const getUserPromptTemplate = (imageContext: string, options: UserPromptOptions) => {
  const question = options.sendImageToLlm
    ? 'Identifique as estruturas vasculares presentes na imagem e responda SOMENTE em JSON compacto com este formato: {"summary":"...","has_vascular_structures":true,"annotated_image_base64":"..."}. O campo summary e obrigatorio e deve resumir os principais achados. Nao retorne coordenadas quando annotated_image_base64 for retornado. Gere apenas 1 imagem anotada com overlays minimos (somente vasos e limite tumoral), sem legenda e sem textos na imagem. Reencode a imagem anotada para JPEG progressivo qualidade 45 e redimensione para no maximo 512px no maior lado antes de converter para base64. Retorne base64 sem prefixo data:image. Se o base64 final passar de 120000 caracteres, reduza novamente a qualidade para 35 e tente de novo. Sem texto extra fora do JSON. Se nao houver estruturas vasculares, mantenha has_vascular_structures=false.'
    : 'Identifique as estruturas vasculares presentes na imagem e responda SOMENTE em JSON compacto com este formato: {"summary":"...","has_vascular_structures":true,"vascular_structures":[{"id":null,"x":0,"y":0,"confidence":0.0}],"tumor_boundaries":[{"x":0,"y":0}]}. O campo summary e obrigatorio e deve resumir os principais achados. Quando sendImageToLlm estiver falso, sempre retorne as coordenadas em vascular_structures e tumor_boundaries (quando houver). Sem texto extra fora do JSON. Se nao houver estruturas vasculares, retorne vascular_structures vazio, tumor_boundaries vazio e has_vascular_structures=false.';

  return JSON.stringify({
    role: 'professional lab technician',
    context_from_neo4j_topk: imageContext,
    instructions: [
      'Carefully analyze the image and prioritize vascular structure identification.',
      'Use the Neo4j context as supporting evidence, but trust the visual evidence from the image first.',
      'Report vessel-related findings with objective values when possible.',
      'Match the language of the question.',
      'Answer only in Portuguese, use utf-8 to avoid encoding issues.'
    ],
    question,
  });
};
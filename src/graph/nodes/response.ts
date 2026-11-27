import path from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import type { GraphState } from '../graph.ts';

const buildReplyText = (state: GraphState): string => {
  if (state.responseError?.trim()) {
    return `Não foi possível analisar a imagem: ${state.responseError}`;
  }

  const lines: string[] = [];

  try {
    const parsed = JSON.parse(state.llmResponse || '{}') as {
      summary?: string;
      has_vascular_structures?: boolean;
      vascular_structures?: Array<{ label: string; confidence: number }>;
    };

    if (parsed.summary) {
      lines.push(parsed.summary);
    }

    if (typeof parsed.has_vascular_structures === 'boolean') {
      lines.push(`Estruturas vasculares: ${parsed.has_vascular_structures ? 'sim' : 'não'}`);
    }

    for (const s of parsed.vascular_structures ?? []) {
      lines.push(`- ${s.label} (confiança ${(s.confidence * 100).toFixed(0)}%)`);
    }
  } catch {
    lines.push(state.llmResponse);
  }

  if (state.responseImagePath) {
    lines.push(`\nImagem anotada: ${state.responseImagePath}`);
  }

  if (state.responseJsonPath) {
    lines.push(`JSON: ${state.responseJsonPath}`);
  }

  return lines.join('\n') || 'Análise concluída.';
};

// URL do `langgraph dev` (rota /images definida em src/http/app.ts).
const publicBaseUrl = (process.env.LANGGRAPH_PUBLIC_URL ?? 'http://localhost:2024').replace(/\/$/, '');

export function responseNode() {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    let text = buildReplyText(state);

    if (!state.responseError?.trim() && state.responseImagePath) {
      const fileName = encodeURIComponent(path.basename(state.responseImagePath));
      text = `![Imagem com overlay](${publicBaseUrl}/images/${fileName})\n\n${text}`;
    }

    // Conteúdo em string (Markdown): o chat do Studio renderiza; arrays aparecem como JSON.
    return { messages: [new AIMessage(text)] };
  };
}

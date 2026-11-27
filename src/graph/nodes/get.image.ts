import type { BaseMessage } from '@langchain/core/messages';
import type { GraphState } from '../graph.ts';

const parseImageInput = (rawInput: string): { mimeType: string; base64: string } => {
  const input = rawInput.trim();
  const dataUrlMatch = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);

  if (!dataUrlMatch) {
    return {
      mimeType: 'image/png',
      base64: input,
    };
  }

  return {
    mimeType: dataUrlMatch[1],
    base64: dataUrlMatch[2].replace(/\s+/g, ''),
  };
};

type ContentBlock = Record<string, any>;

/**
 * Extrai imagem e texto da última mensagem do usuário (modo Chat do Studio).
 * Suporta blocos `image_url` (OpenAI), `image` com base64 (`data`/`source_type`) e texto.
 */
const extractFromMessages = (
  messages: BaseMessage[] | undefined,
): { image?: string; text?: string } => {
  const lastHuman = [...(messages ?? [])].reverse().find((m) => m.getType() === 'human');

  if (!lastHuman) {
    return {};
  }

  if (typeof lastHuman.content === 'string') {
    const text = lastHuman.content.trim();
    return text.startsWith('data:image/') ? { image: text } : { text };
  }

  let image: string | undefined;
  const texts: string[] = [];

  for (const block of lastHuman.content as ContentBlock[]) {
    if (block.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text);
    } else if (block.type === 'image_url') {
      image ??= typeof block.image_url === 'string' ? block.image_url : block.image_url?.url;
    } else if (block.type === 'image') {
      const mime = block.mime_type ?? block.mimeType ?? 'image/png';
      if (typeof block.data === 'string') {
        image ??= block.data.startsWith('data:') ? block.data : `data:${mime};base64,${block.data}`;
      } else if (typeof block.url === 'string') {
        image ??= block.url;
      }
    }
  }

  const text = texts.join('\n').trim();
  return { image, text: text || undefined };
};

export function getImage() {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const fromMessages = extractFromMessages(state.messages);
    const inputBase64 = fromMessages.image?.trim() || state.imageBase64?.trim() || '';

    if (!inputBase64) {
      throw new Error('Envie uma imagem (anexo no chat) ou preencha imageBase64.');
    }

    const parsedInput = parseImageInput(inputBase64);

    return {
      imageBase64: parsedInput.base64,
      imageMimeType: parsedInput.mimeType,
      ...(fromMessages.text ? { question: fromMessages.text } : {}),
    };
  };
}

import { ChatOpenAI } from '@langchain/openai';
import config from '../config.ts';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

type MultimodalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type LLMResponse = {
  model: string;
  content: string;
}

export type PromptReferenceImage = {
  label: string;
  base64: string;
  mimeType: string;
};

type StructuredLlmResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type StructuredLlmService = {
  generateStructured(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodSchema,
  ): Promise<StructuredLlmResult<Record<string, unknown>>>;
  generateStructuredFromImage(
    systemPrompt: string,
    userTextPrompt: string,
    imageBase64: string,
    schema: z.ZodSchema,
    imageMimeType?: string,
    referenceImages?: PromptReferenceImage[],
  ): Promise<StructuredLlmResult<Record<string, unknown>>>;
};

export class OpenRouterService implements StructuredLlmService {
  private llmClient: ChatOpenAI;
  private maxAttempts: number;
  private baseRetryDelayMs: number;

  private static readonly CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
  private static readonly BACKSPACE_HEX_GARBAGE_REGEX = /\u0008[0-9a-f]/gi;

  constructor() {
    this.maxAttempts = Number(config.maxAttempts ?? 3);
    this.baseRetryDelayMs = Number(config.baseRetryDelayMs ?? 2000);

    this.llmClient = new ChatOpenAI({
      apiKey: config.openrouterKey,
      modelName: config.models[0],
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      maxRetries: config.maxAttempts,
      configuration: {
        baseURL: config.baseUrl,
        defaultHeaders: {
          'Referer': config.httpReferer,
          'X-Title': config.xTitle
        }
      }
    })
  }

  private isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('429') || message.includes('MODEL_RATE_LIMIT') || message.includes('rate limit');
  }

  private isTruncatedJsonError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Unterminated string in JSON')
      || message.includes('Unexpected end of JSON input')
      || message.includes('EOF while parsing');
  }

  private isInvalidImagePayloadError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('annotated_image_base64 is missing or invalid')
      || message.includes('corrupted base64 image payload');
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    const delayMs = this.baseRetryDelayMs * attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private sanitizeString(value: string): string {
    return value
      .replace(OpenRouterService.BACKSPACE_HEX_GARBAGE_REGEX, '')
      .replace(OpenRouterService.CONTROL_CHARS_REGEX, '')
      .normalize('NFC');
  }

  private sanitizeData(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeData(item));
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => [
        key,
        this.sanitizeData(fieldValue),
      ]);

      return Object.fromEntries(entries);
    }

    return value;
  }

  private extractJsonPayload(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }

          if (part && typeof part === 'object' && 'type' in part && 'text' in part) {
            return String((part as { text?: unknown }).text ?? '');
          }

          return '';
        })
        .join('');
    }

    return String(content ?? '');
  }

  private unwrapMarkdownCodeFence(payload: string): string {
    const fencedMatch = payload.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    return payload;
  }

  private parseStructuredJson<T>(rawContent: unknown, schema: z.ZodSchema<T>): T {
    const payload = this.unwrapMarkdownCodeFence(this.extractJsonPayload(rawContent).trim());
    const firstBrace = payload.indexOf('{');
    const lastBrace = payload.lastIndexOf('}');
    const jsonText = firstBrace >= 0 && lastBrace >= firstBrace
      ? payload.slice(firstBrace, lastBrace + 1)
      : payload;

    const parsed = JSON.parse(jsonText) as unknown;
    const validated = schema.parse(parsed);

    return this.sanitizeData(validated) as T;
  }

  async generateStructured(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodSchema,
  ): Promise<StructuredLlmResult<Record<string, unknown>>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const messages = [
          new SystemMessage(systemPrompt),
          new HumanMessage(userPrompt)
        ]
        const structuredLlm = this.llmClient.withStructuredOutput(schema, {
          name: 'response'
        });

        const data = this.sanitizeData(
          await structuredLlm.invoke(messages),
        ) as Record<string, unknown>;

        return {
          success: true,
          data,
        }
      } catch (error) {
        const shouldRetry = this.isRateLimitError(error) && attempt < this.maxAttempts;

        if (shouldRetry) {
          await this.waitBeforeRetry(attempt);
          continue;
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    return {
      success: false,
      error: 'OpenRouter request failed after retries.',
    };
  }

  async generateStructuredFromImage(
    systemPrompt: string,
    userTextPrompt: string,
    imageBase64: string,
    schema: z.ZodSchema,
    imageMimeType = 'image/png',
    referenceImages: PromptReferenceImage[] = [],
  ): Promise<StructuredLlmResult<Record<string, unknown>>> {
    const compactRetrySuffix = ' IMPORTANT: keep JSON tiny and valid. Use max 384px longest side, JPEG quality 30, no data URL prefix, no extra keys, no extra text.';

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const promptForAttempt = attempt === 1
          ? userTextPrompt
          : `${userTextPrompt}${compactRetrySuffix}`;

        const content: MultimodalContentPart[] = [
          {
            type: 'text',
            text: promptForAttempt,
          },
        ];

        for (const referenceImage of referenceImages) {
          content.push({
            type: 'text',
            text: `Reference artifact: ${referenceImage.label}`,
          });
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${referenceImage.mimeType};base64,${referenceImage.base64}`,
            },
          });
        }

        content.push({
          type: 'text',
          text: 'Query image to analyze.',
        });
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${imageMimeType};base64,${imageBase64}`,
          },
        });

        const messages = [
          new SystemMessage(systemPrompt),
          new HumanMessage({
            content,
          }),
        ];

        const rawResponse = await this.llmClient.invoke(messages);
        const data = this.parseStructuredJson(rawResponse.content, schema) as Record<string, unknown>;

        return {
          success: true,
          data,
        };
      } catch (error) {
        const shouldRetry = (
          this.isRateLimitError(error)
          || error instanceof SyntaxError
          || this.isTruncatedJsonError(error)
          || this.isInvalidImagePayloadError(error)
        )
          && attempt < this.maxAttempts;

        if (shouldRetry) {
          await this.waitBeforeRetry(attempt);
          continue;
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return {
      success: false,
      error: 'OpenRouter image request failed after retries.',
    };
  }
}
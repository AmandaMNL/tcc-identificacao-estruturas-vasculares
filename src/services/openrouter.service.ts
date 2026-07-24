import { ChatOpenAI } from '@langchain/openai';
import config from '../config.ts';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export type LLMResponse = {
  model: string;
  content: string;
}

export class OpenRouterService {
  private llmClient: ChatOpenAI;
  private maxAttempts: number;
  private baseRetryDelayMs: number;

  constructor() {
    this.maxAttempts = Number(process.env.OPENROUTER_MAX_ATTEMPTS ?? 3);
    this.baseRetryDelayMs = Number(process.env.OPENROUTER_RETRY_DELAY_MS ?? 2000);

    this.llmClient = new ChatOpenAI({
      apiKey: config.openrouterKey,
      modelName: config.models[0],
      temperature: config.temperature,
      maxRetries: 2,
      configuration: {
        baseURL: config.baseUrl,
        defaultHeaders: {
          'Referer': config.httpReferer,
          'X-Title': config.xTitle
        }
      },
      modelKwargs: {
        models: config.models,
        provider: config.provider,
      },
    })
  }

  private isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('429') || message.includes('MODEL_RATE_LIMIT') || message.includes('rate limit');
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    const delayMs = this.baseRetryDelayMs * attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async generateStructured<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodSchema<T>
  ) {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const messages = [
          new SystemMessage(systemPrompt),
          new HumanMessage(userPrompt)
        ]
        const structuredLlm = this.llmClient.withStructuredOutput(schema, {
          name: 'response'
        });

        const data = await structuredLlm.invoke(messages);

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

  async generateStructuredFromImage<T>(
    systemPrompt: string,
    userTextPrompt: string,
    imageBase64: string,
    schema: z.ZodSchema<T>,
    imageMimeType = 'image/png',
  ) {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const messages = [
          new SystemMessage(systemPrompt),
          new HumanMessage({
            content: [
              {
                type: 'text',
                text: userTextPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${imageMimeType};base64,${imageBase64}`,
                },
              },
            ],
          }),
        ];

        const structuredLlm = this.llmClient.withStructuredOutput(schema, {
          name: 'response',
        });

        const data = await structuredLlm.invoke(messages);

        return {
          success: true,
          data,
        };
      } catch (error) {
        const shouldRetry = this.isRateLimitError(error) && attempt < this.maxAttempts;

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
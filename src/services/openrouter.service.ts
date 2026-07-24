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

  constructor() {
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

  async generateStructured<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodSchema<T>
  ) {
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
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async generateStructuredFromImage<T>(
    systemPrompt: string,
    userTextPrompt: string,
    imageBase64: string,
    schema: z.ZodSchema<T>,
    imageMimeType = 'image/png',
  ) {
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
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
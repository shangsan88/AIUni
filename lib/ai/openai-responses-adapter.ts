import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { normalizeOpenAIResponsesBaseUrl } from '@/lib/ai/openai-responses';

export function createOpenAIResponsesModel(config: {
  apiKey: string;
  baseUrl?: string;
  modelId: string;
}): LanguageModel {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeOpenAIResponsesBaseUrl(config.baseUrl),
  });

  return openai.responses(config.modelId);
}

import type { ModelInfo } from '@/lib/types/provider';

const OPENAI_RESPONSES_SUFFIX = /\/responses\/?$/i;

export const OPENAI_CHAT_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    outputWindow: 4096,
    capabilities: { streaming: true, tools: true, vision: true },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o-mini',
    contextWindow: 128000,
    outputWindow: 4096,
    capabilities: { streaming: true, tools: true, vision: true },
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4-turbo',
    contextWindow: 128000,
    outputWindow: 4096,
    capabilities: { streaming: true, tools: true, vision: true },
  },
];

export const OPENAI_RESPONSES_MODELS: ModelInfo[] = [
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    contextWindow: 400000,
    outputWindow: 128000,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      thinking: {
        toggleable: true,
        budgetAdjustable: true,
        defaultEnabled: false,
      },
    },
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    contextWindow: 400000,
    outputWindow: 128000,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      thinking: {
        toggleable: true,
        budgetAdjustable: true,
        defaultEnabled: false,
      },
    },
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    contextWindow: 400000,
    outputWindow: 128000,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      thinking: {
        toggleable: false,
        budgetAdjustable: true,
        defaultEnabled: true,
      },
    },
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5-mini',
    contextWindow: 128000,
    outputWindow: 4096,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      thinking: {
        toggleable: false,
        budgetAdjustable: true,
        defaultEnabled: true,
      },
    },
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5-nano',
    contextWindow: 128000,
    outputWindow: 4096,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      thinking: {
        toggleable: false,
        budgetAdjustable: true,
        defaultEnabled: true,
      },
    },
  },
  {
    id: 'o4-mini',
    name: 'o4-mini',
    contextWindow: 200000,
    outputWindow: 100000,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      thinking: {
        toggleable: false,
        budgetAdjustable: true,
        defaultEnabled: true,
      },
    },
  },
  {
    id: 'o3',
    name: 'o3',
    contextWindow: 200000,
    outputWindow: 100000,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      thinking: {
        toggleable: false,
        budgetAdjustable: true,
        defaultEnabled: true,
      },
    },
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    contextWindow: 200000,
    outputWindow: 100000,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      thinking: {
        toggleable: false,
        budgetAdjustable: true,
        defaultEnabled: true,
      },
    },
  },
  {
    id: 'o1',
    name: 'o1',
    contextWindow: 200000,
    outputWindow: 100000,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      thinking: {
        toggleable: false,
        budgetAdjustable: true,
        defaultEnabled: true,
      },
    },
  },
];

export const OPENAI_RESPONSES_ONLY_MODEL_IDS = new Set(
  OPENAI_RESPONSES_MODELS.map((model) => model.id),
);

export function isOpenAIResponsesBaseUrl(url?: string): boolean {
  return Boolean(url && OPENAI_RESPONSES_SUFFIX.test(url.trim()));
}

export function normalizeOpenAIResponsesBaseUrl(url?: string): string | undefined {
  if (!url) return undefined;

  const trimmed = url.trim();
  if (!trimmed) return undefined;

  return trimmed.replace(OPENAI_RESPONSES_SUFFIX, '');
}

export function getOpenAIResponsesRequestUrl(baseUrl?: string): string | undefined {
  const normalized = normalizeOpenAIResponsesBaseUrl(baseUrl);
  if (!normalized) return undefined;
  return `${normalized}/responses`;
}

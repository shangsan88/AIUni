/**
 * Interview Turn API Endpoint
 *
 * POST /api/interview/turn
 *
 * Runs one interview turn through the orchestration system:
 * 1. Coach agent: provides feedback on the candidate's answer
 * 2. Interviewer agent: asks the next question
 *
 * Each agent uses statelessGenerate() — the same orchestration entrypoint as
 * /api/chat — so both calls share the same event model (agent_start,
 * text_delta, done, error). Text deltas are accumulated server-side and
 * returned as JSON so the existing interview frontend (response.json()) needs
 * no changes.
 *
 * Response shape: { feedback, nextQuestion, coachName, interviewerName }
 */

import { NextRequest } from 'next/server';
import { statelessGenerate } from '@/lib/orchestration/stateless-generate';
import { getModel, parseModelString } from '@/lib/ai/providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { createLogger } from '@/lib/logger';
import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { UIMessage } from 'ai';

const log = createLogger('Interview Turn API');

// Allow up to 60 s for both agent turns
export const maxDuration = 60;

// ── Request / response types ──────────────────────────────────────────────────

interface ConversationEntry {
  role: 'user' | 'coach' | 'interviewer';
  content: string;
}

interface InterviewTurnRequest {
  /** Candidate's latest answer */
  userAnswer: string;
  /** Full conversation history preceding this answer */
  conversationHistory?: ConversationEntry[];
  /** Target job role, e.g. "Software Engineer" */
  role: string;
  /** Interview difficulty */
  difficulty?: 'easy' | 'medium' | 'hard';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// ── Static agent configs ──────────────────────────────────────────────────────

const COACH_ID = 'interview-coach';
const INTERVIEWER_ID = 'interview-interviewer';

function buildCoachConfig(role: string, difficulty: string) {
  return {
    id: COACH_ID,
    name: 'Interview Coach',
    role: 'coach',
    persona: [
      `You are a professional interview coach helping a candidate practise for a ${role} role.`,
      `Difficulty level: ${difficulty}.`,
      'Give concise, actionable feedback on the candidate\'s most recent answer.',
      'Highlight one strength and one concrete improvement. Keep it under 100 words.',
      'Respond only with plain prose — no JSON, no markdown lists.',
    ].join(' '),
    avatar: '🎓',
    color: '#4CAF50',
    allowedActions: [] as string[],
    priority: 1,
    isGenerated: true as const,
  };
}

function buildInterviewerConfig(role: string, difficulty: string) {
  return {
    id: INTERVIEWER_ID,
    name: 'Interviewer',
    role: 'interviewer',
    persona: [
      `You are an experienced interviewer conducting a ${difficulty} interview for a ${role} position.`,
      'Based on the conversation so far, ask exactly one clear follow-up question.',
      'Do not repeat a question that has already been asked.',
      'Respond with the question only — no preamble, no JSON.',
    ].join(' '),
    avatar: '👔',
    color: '#2196F3',
    allowedActions: [] as string[],
    priority: 1,
    isGenerated: true as const,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Drain a statelessGenerate() generator and return all accumulated text.
 * Actions are ignored — the interview agents are configured with no allowed
 * actions so none are expected.
 */
async function collectText(
  generator: AsyncGenerator<StatelessEvent>,
): Promise<string> {
  let text = '';
  for await (const event of generator) {
    if (event.type === 'text_delta') {
      text += event.data.content;
    }
  }
  return text.trim();
}

/**
 * Convert interview conversation history to UIMessage[], then append the
 * candidate's latest answer as the final user message.
 */
function buildMessages(
  history: ConversationEntry[],
  userAnswer: string,
): UIMessage[] {
  let counter = 0;
  const messages: UIMessage[] = history.map((entry) => ({
    id: `interview-msg-${counter++}`,
    role: entry.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: entry.content,
    createdAt: new Date(0),
  }));

  messages.push({
    id: `interview-msg-${counter}`,
    role: 'user' as const,
    content: userAnswer,
    createdAt: new Date(),
  });

  return messages;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: InterviewTurnRequest = await req.json();
    const {
      userAnswer,
      conversationHistory = [],
      role,
      difficulty = 'medium',
    } = body;

    if (!userAnswer || typeof userAnswer !== 'string') {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: userAnswer');
    }
    if (!role || typeof role !== 'string') {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: role');
    }

    // ── Resolve provider config ──
    const modelString = body.model || 'gpt-4o-mini';
    const { providerId, modelId } = parseModelString(modelString);

    const clientBaseUrl = body.baseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const effectiveApiKey = clientBaseUrl
      ? body.apiKey || ''
      : resolveApiKey(providerId, body.apiKey);
    const effectiveBaseUrl = clientBaseUrl
      ? clientBaseUrl
      : resolveBaseUrl(providerId, body.baseUrl);
    const proxy = resolveProxy(providerId);

    if (!effectiveApiKey) {
      return apiError('MISSING_API_KEY', 401, 'API Key is required');
    }

    const { model: languageModel } = getModel({
      providerId,
      modelId,
      apiKey: effectiveApiKey,
      baseUrl: effectiveBaseUrl,
      proxy,
    });

    const signal = req.signal;
    const messages = buildMessages(conversationHistory, userAnswer);

    // Minimal storeState — interview has no classroom stage/scenes
    const storeState: StatelessChatRequest['storeState'] = {
      stage: null,
      scenes: [],
      currentSceneId: null,
      mode: 'autonomous',
      whiteboardOpen: false,
    };

    const thinking: ThinkingConfig = { enabled: false };

    // ── Coach turn ────────────────────────────────────────────────────────────
    log.info(`Coach turn — role: ${role}, difficulty: ${difficulty}`);

    const coachRequest: StatelessChatRequest = {
      messages,
      storeState,
      config: {
        agentIds: [COACH_ID],
        agentConfigs: [buildCoachConfig(role, difficulty)],
      },
      apiKey: effectiveApiKey,
      baseUrl: effectiveBaseUrl,
      model: modelString,
    };

    const feedback = await collectText(
      statelessGenerate(coachRequest, signal, languageModel, thinking),
    );

    // ── Interviewer turn ──────────────────────────────────────────────────────
    log.info(`Interviewer turn — role: ${role}, difficulty: ${difficulty}`);

    const interviewerRequest: StatelessChatRequest = {
      messages,
      storeState,
      config: {
        agentIds: [INTERVIEWER_ID],
        agentConfigs: [buildInterviewerConfig(role, difficulty)],
      },
      apiKey: effectiveApiKey,
      baseUrl: effectiveBaseUrl,
      model: modelString,
    };

    const nextQuestion = await collectText(
      statelessGenerate(interviewerRequest, signal, languageModel, thinking),
    );

    log.info(
      `Interview turn complete — feedback length: ${feedback.length}, question length: ${nextQuestion.length}`,
    );

    return apiSuccess({
      feedback,
      nextQuestion,
      coachName: 'Interview Coach',
      interviewerName: 'Interviewer',
    });
  } catch (error) {
    log.error('Error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}

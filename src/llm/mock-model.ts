import { MockLanguageModelV3 } from 'ai/test';

const MOCK_USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

const MOCK_FINISH_REASON = { unified: 'stop' as const, raw: 'stop' };

/**
 * Returns a mock LanguageModel that always replies with the given text.
 * Used in local testing via the MOCK_AI_RESPONSE env var — never called in production.
 */
export function getMockModel(response: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: response }],
      finishReason: MOCK_FINISH_REASON,
      usage: MOCK_USAGE,
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          const id = 'mock-text-1';
          controller.enqueue({ type: 'text-start' as const, id });
          controller.enqueue({ type: 'text-delta' as const, id, delta: response });
          controller.enqueue({ type: 'text-end' as const, id });
          controller.enqueue({
            type: 'finish' as const,
            finishReason: MOCK_FINISH_REASON,
            usage: MOCK_USAGE,
          });
          controller.close();
        },
      }),
    }),
  });
}

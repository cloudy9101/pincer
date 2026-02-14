// Re-export AI SDK types used throughout the codebase
export type { ModelMessage, ToolSet } from 'ai';
export type { LanguageModel } from 'ai';

export interface LLMCallResult {
  text: string;
  reasoning?: string;
  toolCallCount: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

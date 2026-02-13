export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | LLMContentBlock[];
  toolCallId?: string;
  name?: string;
}

export type LLMContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string; }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  systemPrompt?: string;
  tools?: LLMToolDefinition[];
  maxTokens: number;
  temperature: number;
  thinkingLevel?: string;
}

export interface LLMResponse {
  content: LLMContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop';
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

export interface LLMProvider {
  name: string;
  formatRequest(req: LLMRequest): { url: string; headers: Record<string, string>; body: unknown };
  parseResponse(raw: unknown): LLMResponse;
}

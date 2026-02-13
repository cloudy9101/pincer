import type { LLMProvider, LLMRequest, LLMResponse, LLMContentBlock, LLMMessage } from './types.ts';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string;
  messages: AnthropicMessage[];
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
}

interface AnthropicResponseBody {
  id: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

const THINKING_BUDGETS: Record<string, number> = {
  low: 2048,
  medium: 8192,
  high: 32768,
};

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';

  constructor(
    private apiKey: string,
    private gatewayEndpoint?: string
  ) {}

  formatRequest(req: LLMRequest): { url: string; headers: Record<string, string>; body: unknown } {
    const messages = this.convertMessages(req.messages);

    const body: AnthropicRequestBody = {
      model: req.model,
      max_tokens: req.maxTokens,
      messages,
    };

    if (req.systemPrompt) {
      body.system = req.systemPrompt;
    }

    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools;
    }

    // Only set temperature for non-thinking requests
    if (req.thinkingLevel && req.thinkingLevel !== 'none') {
      const budget = THINKING_BUDGETS[req.thinkingLevel] ?? THINKING_BUDGETS.medium!;
      body.thinking = { type: 'enabled', budget_tokens: budget };
      // Temperature must be 1 when thinking is enabled
      body.temperature = 1;
    } else {
      body.temperature = req.temperature;
    }
    if (body.thinking?.budget_tokens && body.max_tokens <= body.thinking?.budget_tokens) {
      body.max_tokens = body.thinking.budget_tokens + 1024
    }

    const baseUrl = this.gatewayEndpoint
      ? `${this.gatewayEndpoint}/anthropic`
      : 'https://api.anthropic.com';

    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    };
  }

  parseResponse(raw: unknown): LLMResponse {
    const data = raw as AnthropicResponseBody;

    const content: LLMContentBlock[] = data.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      }
      if (block.type === 'thinking') {
        return { type: 'thinking', thinking: block.thinking, signature: block.signature };
      }
      if (block.type === 'tool_use') {
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input };

      }
      return { type: 'text', text: '' };
    });

    let stopReason: LLMResponse['stopReason'] = 'end_turn';
    if (data.stop_reason === 'tool_use') stopReason = 'tool_use';
    else if (data.stop_reason === 'max_tokens') stopReason = 'max_tokens';

    return {
      content,
      stopReason,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
      model: data.model,
    };
  }

  private convertMessages(messages: LLMMessage[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // Handled separately

      if (msg.role === 'tool') {
        // Tool results get appended to the previous user message or create a new user message
        const toolResult: AnthropicContentBlock = {
          type: 'tool_result',
          tool_use_id: msg.toolCallId!,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        };

        const last = result[result.length - 1];
        if (last && last.role === 'user') {
          if (typeof last.content === 'string') {
            last.content = [{ type: 'text', text: last.content }, toolResult];
          } else {
            last.content.push(toolResult);
          }
        } else {
          result.push({ role: 'user', content: [toolResult] });
        }
        continue;
      }

      if (msg.role === 'user') {
        result.push({ role: 'user', content: typeof msg.content === 'string' ? msg.content : msg.content as unknown as AnthropicContentBlock[] });
        continue;
      }

      if (msg.role === 'assistant') {
        result.push({ role: 'assistant', content: typeof msg.content === 'string' ? msg.content : msg.content as unknown as AnthropicContentBlock[] });
        continue;
      }
    }

    return result;
  }
}

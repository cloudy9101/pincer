import type { LLMMessage, LLMContentBlock } from './providers/types.ts';

export function userMessage(text: string): LLMMessage {
  return { role: 'user', content: text };
}

export function assistantMessage(content: LLMContentBlock[]): LLMMessage {
  return { role: 'assistant', content };
}

export function toolResultMessage(toolCallId: string, result: string, isError = false): LLMMessage {
  return {
    role: 'tool',
    toolCallId,
    content: result,
  };
}

export function extractTextContent(content: LLMContentBlock[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export function extractToolCalls(
  content: LLMContentBlock[]
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  return content
    .filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}

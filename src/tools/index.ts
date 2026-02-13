import type { LLMToolDefinition } from '../llm/providers/types.ts';

export function getBuiltinTools(): LLMToolDefinition[] {
  return [
    {
      name: 'link_read',
      description:
        'Fetches the content of a URL and returns the readable text. Use this to read web pages, articles, documentation, etc. when a user shares a link or you need to look something up.',
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch and read',
          },
          max_length: {
            type: 'number',
            description: 'Maximum content length to return (default: 50000)',
          },
        },
        required: ['url'],
      },
    },
  ];
}

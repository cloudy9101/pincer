export const DEFAULTS = {
  model: 'anthropic/claude-sonnet-4-20250514',
  temperature: 0.7,
  maxTokens: 4096,
  thinkingLevel: 'medium',
  compactionThreshold: 200,
  compactionKeepRecent: 50,
  rateLimitPerMinute: 20,
  pairingCodeTtlSeconds: 300,
  systemPrompt: 'You are a helpful AI assistant.',
} as const;

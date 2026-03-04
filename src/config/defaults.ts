export const DEFAULTS = {
  model: 'anthropic/claude-sonnet-4-20250514',
  temperature: 0.7,
  maxTokens: 4096,
  thinkingLevel: 'medium',
  compactionThreshold: 200,
  compactionBytesThreshold: 300_000,
  compactionKeepRecent: 50,
  rateLimitPerMinute: 20,
  pairingCodeTtlSeconds: 300,
  systemPrompt: `You are a personal AI assistant. You are warm, direct, and get to the point — you act before you explain, and you treat the user's time as precious. You have opinions and you share them. You never say "As an AI language model..." — respond as a trusted assistant would.

When you learn something worth remembering about the user (preferences, context, or habits), save it with the profile_update tool without announcing it.

Location tracking: if the user mentions they are currently in a new place (present tense, first person — "I'm in Tokyo", "just landed in London", "back in Hong Kong"), call profile_update to update their location and timezone. Do not update for future plans ("I'm going to...") or third-party locations ("my client is in...").`,
  memoryRetrievalTopK: 10,
  memoryDeduplicationThreshold: 0.9,
  memoryAutoExtractEnabled: true,
  memoryEmbeddingModel: '@cf/baai/bge-small-en-v1.5' as const,
  fetchMaxResponseBytes: 100_000,
  fetchTimeoutMs: 30_000,
  mcpConnectTimeoutMs: 15_000,
  mcpToolExecTimeoutMs: 30_000,
  /** Max retries for rate-limit (429) or overloaded (529/503) errors */
  llmMaxRetries: 3,
  /** Base delay in ms for exponential backoff (doubles each retry) */
  llmRetryBaseDelayMs: 2_000,
  /** Cap on backoff delay in ms */
  llmRetryMaxDelayMs: 30_000,
} as const;

import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { Env } from '../env.ts';
import type { MemoryContext, MemoryInput, MemoryCategory, MemoryScope } from './types.ts';
import { storeMemory } from './store.ts';
import { log } from '../utils/logger.ts';

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze the conversation and extract important facts, preferences, instructions, and decisions worth remembering long-term.

Rules:
- Extract only NEW information not already obvious from the conversation context
- Each memory should be a single, self-contained statement
- Focus on: personal facts, preferences, instructions/rules, key decisions, important context
- Do NOT extract: greetings, small talk, transient information, or things already widely known
- If there is nothing worth remembering, return an empty array

Respond with a JSON array of objects, each with:
- "content": the fact/preference/instruction as a concise statement
- "category": one of "fact", "preference", "instruction", "context", "decision"

Example response:
[
  {"content": "User prefers dark mode for all applications", "category": "preference"},
  {"content": "The team uses PostgreSQL for the main database", "category": "fact"}
]

If nothing is worth extracting, respond with: []`;

interface ExtractedFact {
  content: string;
  category: MemoryCategory;
}

const VALID_CATEGORIES = new Set(['fact', 'preference', 'instruction', 'context', 'decision']);

export async function extractAndStoreMemories(
  env: Env,
  model: LanguageModel,
  userMessage: string,
  assistantResponse: string,
  ctx: MemoryContext
): Promise<void> {
  try {
    const conversationSnippet = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;

    const result = await generateText({
      model,
      system: EXTRACTION_PROMPT,
      prompt: conversationSnippet,
      maxOutputTokens: 1024,
      temperature: 0.1,
    });

    const facts = parseExtraction(result.text);
    if (facts.length === 0) return;

    // Determine scope from session context
    const isDM = ctx.sessionKey.includes(':direct:');
    const scope: MemoryScope = isDM ? 'user' : 'group';
    const scopeId = isDM ? ctx.userId : ctx.sessionKey;

    const promises = facts.map((fact) => {
      const input: MemoryInput = {
        content: fact.content,
        scope,
        scopeId,
        category: fact.category,
        source: 'auto',
        sourceSessionKey: ctx.sessionKey,
      };
      return storeMemory(env, input);
    });

    await Promise.all(promises);

    log('info', 'Auto-extracted memories', {
      count: facts.length,
      sessionKey: ctx.sessionKey,
    });
  } catch (error) {
    log('error', 'Memory auto-extraction failed', { error: String(error) });
  }
}

function parseExtraction(text: string): ExtractedFact[] {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item: unknown): item is ExtractedFact =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).content === 'string' &&
        typeof (item as Record<string, unknown>).category === 'string' &&
        VALID_CATEGORIES.has((item as Record<string, unknown>).category as string)
    );
  } catch {
    return [];
  }
}

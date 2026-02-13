import type { IncomingMessage } from '../channels/types.ts';
import type { BindingRule } from '../config/types.ts';

export interface ResolvedRoute {
  agentId: string;
  accountId?: string;
}

export async function resolveRoute(db: D1Database, msg: IncomingMessage): Promise<ResolvedRoute> {
  // Load all bindings for this channel, ordered by priority desc
  const { results } = await db
    .prepare('SELECT * FROM bindings WHERE channel = ? ORDER BY priority DESC')
    .bind(msg.channel)
    .all();

  const bindings = results as unknown as BindingRule[];

  for (const binding of bindings) {
    // Check guild match (Discord)
    if (binding.guildId && binding.guildId !== msg.guildId) continue;

    // Check peer_kind + peer_id match
    if (binding.peerKind && binding.peerId) {
      if (binding.peerKind === 'direct' && msg.chatType === 'direct' && binding.peerId === msg.senderId) {
        return { agentId: binding.agentId, accountId: binding.accountId ?? undefined };
      }
      if (binding.peerKind === 'group' && msg.chatType === 'group' && binding.peerId === msg.chatId) {
        return { agentId: binding.agentId, accountId: binding.accountId ?? undefined };
      }
      continue;
    }

    // Wildcard match (no peer filter)
    if (!binding.peerKind && !binding.peerId) {
      return { agentId: binding.agentId, accountId: binding.accountId ?? undefined };
    }
  }

  // Default: main agent
  return { agentId: 'main' };
}

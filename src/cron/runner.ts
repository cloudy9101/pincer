import { Cron } from 'croner';
import type { Env } from '../env.ts';
import { sendTelegramMessage } from '../channels/telegram/send.ts';
import { getAgent } from '../config/loader.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { log } from '../utils/logger.ts';
import { resolveBotToken } from '../security/bootstrap.ts';

interface CronJobRow {
  id: string;
  name: string;
  schedule: string;
  agent_id: string;
  prompt: string;
  reply_channel: string | null;
  reply_chat_id: string | null;
  enabled: number;
}

export async function runCronJobs(env: Env, scheduledTime: number): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT id, name, schedule, agent_id, prompt, reply_channel, reply_chat_id, enabled FROM cron_jobs WHERE enabled = 1'
  ).all<CronJobRow>();

  const nowMinute = Math.floor(scheduledTime / 60_000);
  // Floor to the minute boundary so a slightly-delayed trigger (e.g. 19:00:03)
  // still matches expressions that fire at 19:00.
  const minuteStart = nowMinute * 60_000;

  const jobs = results.filter(job => {
    try {
      const next = new Cron(job.schedule).nextRun(new Date(minuteStart - 1));
      return next !== null && Math.floor(next.getTime() / 60_000) === nowMinute;
    } catch (e) {
      log('error', 'Invalid cron expression', { jobId: job.id, schedule: job.schedule, error: String(e) });
      return false;
    }
  });

  if (jobs.length === 0) return;

  log('info', 'Running cron jobs', { count: jobs.length, scheduledTime });

  await Promise.allSettled(jobs.map(job => runJob(env, job, scheduledTime)));
}

async function runJob(env: Env, job: CronJobRow, scheduledTime: number): Promise<void> {
  try {
    const agent = await getAgent(env.DB, env.CACHE, job.agent_id);
    const sessionKey = `agent:${job.agent_id}:cron:${job.id}`;

    const doId = env.CONVERSATION_DO.idFromName(sessionKey);
    const stub = env.CONVERSATION_DO.get(doId);

    const result = await stub.runTask({
      text: job.prompt,
      agentId: job.agent_id,
      userId: `cron:${job.id}`,
      sessionKey,
      model: agent?.model ?? DEFAULTS.model,
      systemPrompt: agent?.systemPrompt ?? DEFAULTS.systemPrompt,
      thinkingLevel: agent?.thinkingLevel ?? DEFAULTS.thinkingLevel,
      temperature: agent?.temperature ?? DEFAULTS.temperature,
      maxTokens: agent?.maxTokens ?? DEFAULTS.maxTokens,
    });

    // Update last_run_at regardless of reply delivery outcome
    await env.DB.prepare('UPDATE cron_jobs SET last_run_at = ? WHERE id = ?')
      .bind(Math.floor(scheduledTime / 1000), job.id)
      .run();

    if (!result.text || !job.reply_channel || !job.reply_chat_id) return;

    if (job.reply_channel === 'telegram') {
      const botToken = await resolveBotToken(env.CACHE);
      if (botToken) {
        await sendTelegramMessage(
          { channel: 'telegram', chatId: job.reply_chat_id, text: result.text },
          botToken,
        );
      }
    }
  } catch (e) {
    log('error', 'Cron job failed', { jobId: job.id, name: job.name, error: String(e) });
    // Update last_run_at even on failure so we don't keep retrying in the same window
    try {
      await env.DB.prepare('UPDATE cron_jobs SET last_run_at = ? WHERE id = ?')
        .bind(Math.floor(scheduledTime / 1000), job.id)
        .run();
    } catch { /* best effort */ }
  }
}

import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { installSkill, removeSkill, updateSkillSecrets, listSkillSecretKeys } from '../../skills/installer.ts';
import { CATALOG, getCatalogEntry } from '../../skills/catalog.ts';

type HonoEnv = { Bindings: Env };

export const skillsRouter = new Hono<HonoEnv>();

// Catalog routes — must be declared before /:name catch-all
skillsRouter.get('/catalog', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT name FROM skills').all();
  const installedNames = new Set(results.map(r => r.name as string));
  return c.json(CATALOG.map(e => ({
    name: e.name,
    displayName: e.displayName,
    description: e.description,
    authType: e.authType,
    secretFields: e.secretFields,
    oauthProvider: e.oauthProvider ?? null,
    setupUrl: e.setupUrl ?? null,
    installed: installedNames.has(e.name),
  })));
});

skillsRouter.post('/catalog/:name/install', async (c) => {
  const skillName = c.req.param('name');
  const entry = getCatalogEntry(skillName);
  if (!entry) return c.json({ error: 'Catalog skill not found' }, 404);
  const body = await c.req.json() as { secrets?: Record<string, string> };
  try {
    const skill = await installSkill(c.env, { content: entry.content });
    if (body.secrets && Object.keys(body.secrets).length > 0) {
      await updateSkillSecrets(c.env, skill.name, body.secrets);
    }
    return c.json({ ok: true, name: skill.name });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

skillsRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT name, display_name, description, auth_type, source_url, version, status, installed_at, updated_at FROM skills ORDER BY name'
  ).all();
  return c.json(results);
});

skillsRouter.post('/', async (c) => {
  const input = await c.req.json() as { content?: string; url?: string };
  try {
    const skill = await installSkill(c.env, input);
    return c.json({ ok: true, name: skill.name, description: skill.description, authType: skill.authType });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

skillsRouter.get('/:name/secrets', async (c) => {
  const skillName = decodeURIComponent(c.req.param('name'));
  const keys = await listSkillSecretKeys(c.env, skillName);
  return c.json({ keys });
});

skillsRouter.put('/:name/secrets', async (c) => {
  const skillName = decodeURIComponent(c.req.param('name'));
  const secrets = await c.req.json() as Record<string, string>;
  await updateSkillSecrets(c.env, skillName, secrets);
  return c.json({ ok: true });
});

skillsRouter.get('/:name', async (c) => {
  const skillName = decodeURIComponent(c.req.param('name'));
  const row = await c.env.DB.prepare('SELECT * FROM skills WHERE name = ?').bind(skillName).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

skillsRouter.delete('/:name', async (c) => {
  const skillName = decodeURIComponent(c.req.param('name'));
  const removed = await removeSkill(c.env, skillName);
  return c.json({ ok: removed });
});

import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { getMedia } from '../media/store.ts';

type HonoEnv = { Bindings: Env };

export const mediaRouter = new Hono<HonoEnv>();

mediaRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const object = await getMedia(c.env.MEDIA, id);
  if (!object) return c.text('Not Found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(object.body, { headers });
});

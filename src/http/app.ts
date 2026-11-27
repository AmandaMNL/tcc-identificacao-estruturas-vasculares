import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';

// Rotas extras do `langgraph dev`: serve as imagens anotadas salvas em response/
// para que o chat do Studio consiga exibi-las via Markdown.
const responseDir = path.resolve(process.cwd(), 'response');

const mimeByExt: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export const app = new Hono();

app.get('/images/:name', async (c) => {
  const name = path.basename(c.req.param('name'));
  const mime = mimeByExt[path.extname(name).toLowerCase()];

  if (!mime) {
    return c.notFound();
  }

  try {
    const file = await readFile(path.join(responseDir, name));
    return c.body(file, 200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' });
  } catch {
    return c.notFound();
  }
});

// Static server for the e2e suite: the harness page (e2e/harness/) and the built package (dist/),
// served as built. TypeScript in the harness has its types stripped; nothing else is transformed.
// Usage: tsx scripts/serve-e2e.ts <port>

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { extname, join, normalize, sep } from 'node:path';

const ROOT = process.cwd();
const HARNESS = join(ROOT, 'e2e', 'harness');
const DIST = join(ROOT, 'dist');
const port = Number(process.argv[2]) || 5184;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** The file a URL path maps to, or undefined outside the harness and dist/. */
function resolve(urlPath: string): string | undefined {
  const path = normalize(decodeURIComponent(urlPath)).replace(/^[\\/]+/, '');
  const [base, rest] = path.startsWith(`dist${sep}`)
    ? [DIST, path.slice(5)]
    : [HARNESS, path || 'index.html'];
  const file = join(base, rest);
  return file.startsWith(base + sep) ? file : undefined;
}

async function body(file: string): Promise<string | Buffer> {
  const contents = await readFile(file);
  return extname(file) === '.ts' ? stripTypeScriptTypes(contents.toString()) : contents;
}

createServer(async (req, res) => {
  const file = resolve(new URL(req.url ?? '/', 'http://localhost').pathname);
  const type = file && TYPES[extname(file)];
  if (!file || !type) {
    res.writeHead(404).end();
    return;
  }
  try {
    const content = await body(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(content);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, () => console.log(`e2e server on http://localhost:${port}`));

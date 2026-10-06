// The suite tests dist/, so a stale build would test old code and still pass. Fail fast instead.
// `npm run test:e2e` builds first; running `playwright test` directly needs `npm run build`.

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Unit tests aren't built, so editing one doesn't make dist/ stale. */
const isBuilt = (name: string) => !/\.test\.ts$|^setupTests\.ts$/.test(name);

async function newestIn(dir: string): Promise<number> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && isBuilt(e.name));
  const times = await Promise.all(
    files.map(async (e) => (await stat(join(e.parentPath, e.name))).mtimeMs),
  );
  return Math.max(0, ...times);
}

export default async function globalSetup(): Promise<void> {
  const built = await stat('dist/index.js').then(
    (s) => s.mtimeMs,
    () => 0,
  );
  if (built === 0) throw new Error('No dist/ build: run `npm run build` (or `npm run test:e2e`).');
  if ((await newestIn('src')) > built) {
    throw new Error('dist/ is older than src/: run `npm run build` (or `npm run test:e2e`).');
  }
}

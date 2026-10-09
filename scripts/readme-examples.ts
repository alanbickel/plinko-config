// Checks that README.md's TypeScript examples match the type-checked regions in site/examples/:
// every ```ts block in the README must be a copy of one region, and every region must appear.
// Run by `npm run docs:examples`, after tsc has checked the regions themselves.
// Usage: tsx scripts/readme-examples.ts

import { readFileSync } from 'node:fs';

const README = 'README.md';
const SOURCES = ['site/examples/readme.ts', 'site/examples/readme-element.ts'];

/** `#region name` … `#endregion name` bodies, keyed by "file#name". */
function regions(file: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /^\/\/ #region (\S+)\n([\s\S]*?)^\/\/ #endregion \1$/gm;
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const [, name, body] of text.matchAll(pattern)) {
    found.set(`${file}#${name}`, body.trimEnd());
  }
  return found;
}

/** Bodies of the README's ```ts fenced blocks, with their line numbers. */
function tsBlocks(file: string): { line: number; body: string }[] {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const blocks: { line: number; body: string }[] = [];
  for (const match of text.matchAll(/^```ts\n([\s\S]*?)^```$/gm)) {
    const line = text.slice(0, match.index).split('\n').length;
    blocks.push({ line, body: match[1].trimEnd() });
  }
  return blocks;
}

/** The first line where two texts differ, for the error message. */
function firstDifference(a: string, b: string): string {
  const left = a.split('\n');
  const right = b.split('\n');
  const i = left.findIndex((line, n) => line !== right[n]);
  const at = i === -1 ? left.length : i;
  return `line ${at + 1} of the block:\n    README: ${left[at] ?? '(end)'}\n    region: ${right[at] ?? '(end)'}`;
}

const all = new Map(SOURCES.flatMap((file) => [...regions(file)]));
const unused = new Set(all.keys());
const errors: string[] = [];

for (const { line, body } of tsBlocks(README)) {
  const match = [...all].find(([, region]) => region === body);
  if (match) {
    unused.delete(match[0]);
    continue;
  }
  // Name the region it most likely came from: the one sharing its first line.
  const first = body.split('\n')[0];
  const near = [...all].find(([, region]) => region.split('\n')[0] === first);
  errors.push(
    near
      ? `${README}:${line} differs from ${near[0]} at ${firstDifference(body, near[1])}`
      : `${README}:${line} is not a copy of any region in ${SOURCES.join(', ')}`,
  );
  if (near) unused.delete(near[0]);
}
for (const name of unused) errors.push(`${name} is missing from ${README}`);

if (errors.length > 0) {
  console.error(`README examples out of step:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`README examples match ${all.size} regions.`);

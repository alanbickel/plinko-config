// Records the README GIF: the Examples page's theme picker on the built docs site, with three
// chips dragged onto the board. Playwright records the page; ffmpeg crops it and makes the GIF.
// Needs ffmpeg on PATH and a built site (`npm run docs:build`).
// Usage: tsx scripts/readme-gif.ts [--out .github/readme.gif]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Locator, type Page } from '@playwright/test';

const { values: args } = parseArgs({
  options: { out: { type: 'string', default: '.github/readme.gif' } },
});

const DIST = join(process.cwd(), 'site', '.vitepress', 'dist');
const BASE = '/plinko-config/';
// Narrow enough that the page stacks each board above its code, so the result card is about board-wide.
const VIEWPORT = { width: 420, height: 900 };
/** GIF width in pixels; the height follows the crop. */
const WIDTH = 360;
const FPS = 24;
/** Drop spots across the board, one per slot: Light, Dark, System. */
const DROPS = [0.5, 0.21, 0.79];
/** Takes to try before giving up on three landings in three different slots. */
const TAKES = 12;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

/** The built file a URL path maps to (VitePress clean URLs drop ".html"), or undefined. */
function resolve(urlPath: string): string | undefined {
  if (!urlPath.startsWith(BASE)) return undefined;
  const path = normalize(decodeURIComponent(urlPath.slice(BASE.length)));
  for (const candidate of [path, `${path}.html`, join(path, 'index.html')]) {
    const file = join(DIST, candidate);
    if (!file.startsWith(DIST + sep)) return undefined;
    try {
      if (statSync(file).isFile()) return file;
    } catch {}
  }
  return undefined;
}

/** Serves the built site on a free port; resolves to its origin. */
function serve(): Promise<{ origin: string; close: () => void }> {
  const server = createServer((req, res) => {
    const file = resolve(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((done) =>
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      done({ origin: `http://localhost:${port}`, close: () => server.close() });
    }),
  );
}

/** An arrow cursor that follows the mouse, since recordings don't show the real one. */
async function showCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 2 L2 18 L6.5 13.5 L9.5 20 L12.5 18.7 L9.5 12.3 L16 12.3 Z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '-50px',
      top: '0',
      zIndex: '99999',
      pointerEvents: 'none',
      transformOrigin: '2px 2px',
      transition: 'transform 80ms',
    });
    document.body.append(cursor);
    addEventListener('pointermove', (e) => {
      cursor.style.left = `${e.clientX - 2}px`;
      cursor.style.top = `${e.clientY - 2}px`;
    });
    addEventListener('pointerdown', () => {
      cursor.style.transform = 'scale(0.85)';
    });
    addEventListener('pointerup', () => {
      cursor.style.transform = '';
    });
  });
}

interface Take {
  video: string;
  /** Seconds into the video where the clip starts; it runs to the end. */
  start: number;
  crop: { x: number; y: number; width: number; height: number };
}

type Box = Take['crop'];

/** Where the theme picker's canvas and result card are, and the board's column to crop to. */
interface Layout {
  page: Page;
  canvas: Box;
  crop: Box;
  output: Locator;
}

/** Scrolls the theme picker into view, adds the cursor, and measures it. */
async function openThemePicker(page: Page, origin: string): Promise<Layout> {
  await page.goto(`${origin}${BASE}examples`);
  const board = page.locator('.example-board').first();
  const output = board.locator('.example-output');
  await board.scrollIntoViewIfNeeded();
  await page.mouse.move(VIEWPORT.width - 40, VIEWPORT.height - 40);
  await showCursor(page);
  await page.waitForTimeout(800);

  const canvas = await board.locator('canvas').boundingBox();
  const out = await output.boundingBox();
  const host = await board.boundingBox();
  if (!canvas || !out || !host) throw new Error('theme picker not laid out');
  // The board's column, from the top of the canvas to the bottom of the result card.
  const pad = 12;
  const crop = {
    x: Math.round(host.x - pad),
    y: Math.round(canvas.y - pad),
    width: Math.round(host.width + 2 * pad),
    height: Math.round(out.y + out.height - canvas.y + 2 * pad),
  };
  return { page, canvas, crop, output };
}

/** The tray's one chip, at the bottom of the canvas. */
const trayChip = ({ canvas }: Layout) => ({
  x: canvas.x + canvas.width / 2,
  y: canvas.y + canvas.height * 0.87,
});

/**
 * Drags the tray chip to above the board, a fraction of the way across, lets go, and waits for
 * the card to change. Resolves to the card's text, or undefined when the chip landed in the
 * previous chip's slot and the card stayed put.
 */
async function dropChip(layout: Layout, fraction: number): Promise<string | undefined> {
  const { page, canvas, output } = layout;
  const tray = trayChip(layout);
  const before = await output.textContent();
  await page.mouse.move(tray.x, tray.y, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * fraction, canvas.y + canvas.height * 0.04, {
    steps: 25,
  });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.mouse.move(canvas.x + canvas.width + 30, canvas.y + canvas.height * 0.3, {
    steps: 15,
  });
  const changed = await page
    .waitForFunction(
      ([el, text]) => el?.textContent !== text,
      [await output.elementHandle(), before] as const,
      { timeout: 10_000 },
    )
    .then(() => true)
    .catch(() => false);
  const after = (await output.textContent()) ?? '';
  console.log(`  ${changed ? 'landed' : 'same slot again'}: ${after}`);
  return changed ? after : undefined;
}

/** One recording of three drops; undefined unless each lands in a slot none landed in before. */
async function record(origin: string, dir: string): Promise<Take | undefined> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: 'dark',
      recordVideo: { dir, size: VIEWPORT },
    });
    const page = await context.newPage();
    const opened = Date.now();
    const layout = await openThemePicker(page, origin);
    const start = (Date.now() - opened) / 1000;
    const tray = trayChip(layout);
    await page.mouse.move(tray.x + 60, tray.y + 30);
    await page.waitForTimeout(400);
    const shown = new Set<string>();
    for (const fraction of DROPS) {
      const card = await dropChip(layout, fraction);
      if (card === undefined || shown.has(card)) return undefined;
      shown.add(card);
      await page.waitForTimeout(1200);
    }
    await page.waitForTimeout(1500);

    await context.close();
    const video = await page.video()?.path();
    if (!video) throw new Error('no video recorded');
    return { video, start, crop: layout.crop };
  } finally {
    await browser.close();
  }
}

const dir = mkdtempSync(join(tmpdir(), 'readme-gif-'));
const server = await serve();
try {
  let take: Take | undefined;
  for (let i = 1; i <= TAKES && !take; i++) {
    console.log(`take ${i}`);
    take = await record(server.origin, dir);
  }
  if (!take) throw new Error(`no take in ${TAKES} landed in all three slots`);

  const { x, y, width, height } = take.crop;
  const filter = [
    `crop=${width}:${height}:${x}:${y}`,
    `fps=${FPS}`,
    `scale=${WIDTH}:-1:flags=lanczos`,
    'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  ].join(',');
  execFileSync(
    'ffmpeg',
    ['-y', '-v', 'error', '-ss', String(take.start)].concat([
      '-i',
      take.video,
      '-vf',
      filter,
      '-loop',
      '0',
      args.out,
    ]),
    { stdio: 'inherit' },
  );
  console.log(`${args.out}: ${(statSync(args.out).size / 1024).toFixed(0)} kB`);
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}

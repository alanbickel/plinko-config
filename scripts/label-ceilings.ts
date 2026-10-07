// Measures the guidance table in site/contracts/sizing.md ("Labels and narrow slots"): the most
// slots whose labels stay apart and inside the canvas, per screen, text scale, rows and layout.
// Re-run after changing how labels or the board are sized, and paste the table into the page.
// Usage: npm run build && tsx scripts/label-ceilings.ts [mixed|short]

import { type ChildProcess, spawn } from 'node:child_process';
import { type Browser, chromium } from '@playwright/test';
import type { MountSpec } from '../e2e/harness/harness';
import { lastFrameText, overlaps, recordText } from '../e2e/text-record';

const PORT = 5185;
const URL = `http://localhost:${PORT}/`;
const MOST_SLOTS = 25;
const WORKERS = 6;

const SCREENS = {
  'Phone 320×568': { width: 320, height: 568 },
  'Pixel 7 (412×839)': { width: 412, height: 839 },
  'Desktop 1280×800': { width: 1280, height: 800 },
  'Desktop 1280×520': { width: 1280, height: 520 },
};
/** 200% text both ways: the browser's font size setting (root 32px), and page zoom. */
const SCALES = {
  '100%': { rem: 16, zoom: 1 },
  '200% font size': { rem: 32, zoom: 1 },
  '200% zoom': { rem: 16, zoom: 2 },
};
const ROWS = [3, 8, 16];
const LAYOUTS = ['horizontal', 'vertical', 'backboard', 'angled'] as const;
const LABEL_SETS: Record<string, string[]> = {
  mixed: ['Email Marketing', 'Dark Mode', 'Cookies', 'Push Notifications', 'Autoplay'],
  short: ['Ads', 'Dark Mode', 'Map', 'Cookies', 'Wi-Fi', 'Sound', 'Tips'],
};

type Screen = keyof typeof SCREENS;
type Scale = keyof typeof SCALES;

interface Combo {
  screen: Screen;
  scale: Scale;
  rows: number;
  layout: (typeof LAYOUTS)[number];
}

interface Trial {
  combo: Combo;
  slots: number;
}

interface Sweep {
  browser: Browser;
  labels: string[];
}

/** Opens the harness for one combo and slot count, and reads where the labels were drawn. */
async function labelsApart({ browser, labels }: Sweep, { combo, slots }: Trial): Promise<boolean> {
  const { rem, zoom } = SCALES[combo.scale];
  const screen = SCREENS[combo.screen];
  const context = await browser.newContext({
    viewport: { width: Math.round(screen.width / zoom), height: Math.round(screen.height / zoom) },
    deviceScaleFactor: zoom,
  });
  const page = await context.newPage();
  // tsx names functions with a helper the page doesn't have; give it one.
  await page.addInitScript('globalThis.__name = (f) => f;');
  await recordText(page);
  await page.goto(URL);
  await page.waitForFunction(() => window.harness !== undefined);
  const names = Array.from({ length: slots }, (_, i) => labels[i % labels.length] as string);
  const spec: MountSpec = {
    css: `html { font-size: ${rem}px; }`,
    options: {
      slots: names.map((label, i) => ({ id: `s${i}`, label })),
      board: { rows: combo.rows },
      slotLabels: { layout: combo.layout, horizontalWhenFit: false },
    },
  };
  await page.evaluate((s) => window.harness.mount(s), spec);
  // Slot labels are drawn before any other text.
  const drawn = (await lastFrameText(page)).slice(0, slots);
  const canvas = await page.locator('#host canvas').evaluate((el) => el.getBoundingClientRect());
  await context.close();
  const inside = (x: number, y: number) =>
    x >= -1 && y >= -1 && x <= canvas.width + 1 && y <= canvas.height + 1;
  const within = drawn.every((t) => t.box.every((p) => inside(p.x, p.y)));
  const apart = drawn.every((t, i) =>
    drawn.slice(i + 1).every((u) => !overlaps({ p: t.box, q: u.box })),
  );
  return within && apart;
}

/** The most slots, up to MOST_SLOTS, whose labels stay apart; 1 if even 2 don't. */
async function ceiling(sweep: Sweep, combo: Combo): Promise<number> {
  if (!(await labelsApart(sweep, { combo, slots: 2 }))) return 1;
  // Halving assumes more slots never helps once labels touch: they only share the width further.
  let [lo, hi] = [2, MOST_SLOTS + 1];
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const ok = await labelsApart(sweep, { combo, slots: mid });
    [lo, hi] = ok ? [mid, hi] : [lo, mid];
  }
  return lo;
}

const keyOf = ({ screen, scale, rows, layout }: Combo) => `${screen}|${scale}|${rows}|${layout}`;

function combos(): Combo[] {
  const screens = Object.keys(SCREENS) as Screen[];
  const scales = Object.keys(SCALES) as Scale[];
  return screens.flatMap((screen) =>
    scales.flatMap((scale) =>
      ROWS.flatMap((rows) => LAYOUTS.map((layout) => ({ screen, scale, rows, layout }))),
    ),
  );
}

/** Runs every combo, a few at a time. */
async function measureAll(sweep: Sweep): Promise<Map<string, number>> {
  const queue = combos();
  const results = new Map<string, number>();
  const worker = async () => {
    for (let combo = queue.shift(); combo; combo = queue.shift()) {
      results.set(keyOf(combo), await ceiling(sweep, combo));
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return results;
}

/** The table as it appears on the page: one cell per row count, one number per layout. */
function table(results: Map<string, number>): string {
  const cell = (n: number | undefined) => (n === undefined || n < 2 ? '–' : String(n));
  const header = ['Screen', 'Text', ...ROWS.map((r) => `${r} rows`)];
  const lines = [header, header.map(() => '---')];
  for (const screen of Object.keys(SCREENS) as Screen[]) {
    for (const scale of Object.keys(SCALES) as Scale[]) {
      const counts = ROWS.map((rows) =>
        LAYOUTS.map((layout) => cell(results.get(keyOf({ screen, scale, rows, layout })))).join(
          ' / ',
        ),
      );
      lines.push([screen, scale, ...counts]);
    }
  }
  return lines.map((cells) => `| ${cells.join(' | ')} |`).join('\n');
}

async function serve(): Promise<ChildProcess> {
  // Node itself, not npx: kill() then reaches the server, not just a wrapper around it.
  const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/serve-e2e.ts', String(PORT)]);
  for (let tries = 0; tries < 50; tries++) {
    if (
      await fetch(URL).then(
        (r) => r.ok,
        () => false,
      )
    )
      return server;
    await new Promise((r) => setTimeout(r, 200));
  }
  server.kill();
  throw new Error(`The e2e server didn't start on ${PORT}.`);
}

const set = process.argv[2] ?? 'mixed';
const labels = LABEL_SETS[set];
if (!labels) throw new Error(`Unknown label set "${set}": use ${Object.keys(LABEL_SETS)}.`);
const server = await serve();
const browser = await chromium.launch();
try {
  const results = await measureAll({ browser, labels });
  console.log(
    `Labels: ${labels.join(', ')}. Each cell: horizontal / vertical / backboard / angled.\n`,
  );
  console.log(table(results));
} finally {
  await browser.close();
  server.kill();
}

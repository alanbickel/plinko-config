import type { Browser, Page } from '@playwright/test';
import { SIDE } from '../src/runtime/view/geometry';
import { expect, test } from './fixtures';
import type { HarnessOptions, MountSpec } from './harness/harness';
import { type Cell, cellName, labelsFor, pairwise, VIEWPORTS } from './text-matrix';
import { type DrawnText, lastFrameText, overlaps, type Point, recordText } from './text-record';

// Canvas text sizing (WCAG 2.2 SC 1.4.4): slot labels follow the root font size and browser zoom,
// never drop below 0.75rem, and fit the canvas without overlapping. Zoom is emulated the way desktop
// zoom changes layout: a viewport zoom times smaller, deviceScaleFactor zoom times larger. Pinch
// zoom magnifies without reflow, so there's nothing for the board to do: not tested.
//
// The rule these cells check, labels kept apart wherever floor-size text has room, is documented
// in site/contracts/sizing.md ("Labels and narrow slots"). Change them together.

/** No canvas text is smaller than this many rem. */
const FLOOR_REM = 0.75;
/** Rounding in font strings and transforms, CSS pixels. */
const EPS = 0.05;

/** The canvas's box on the page, CSS pixels. */
interface CanvasBox {
  width: number;
  height: number;
  right: number;
}

interface Opened {
  page: Page;
  labels: DrawnText[];
  /** Everything drawn in the last frame: labels, tray captions and notes, the banner. */
  drawn: DrawnText[];
  canvas: CanvasBox;
  close(): Promise<void>;
}

/** More than a cell says: options merged over the cell's, and page CSS after its own. */
interface Extra {
  options?: Partial<HarnessOptions>;
  css?: string;
}

interface OpenInput {
  browser: Browser;
  cell: Cell;
  extra?: Extra;
}

const viewportOf = ({ viewport, zoom }: Cell) => ({
  width: Math.round(VIEWPORTS[viewport].width / zoom),
  height: Math.round(VIEWPORTS[viewport].height / zoom),
});

const mountSpecOf = (cell: Cell, extra: Extra = {}): MountSpec => ({
  css: `html { font-size: ${cell.rem}px; } ${extra.css ?? ''}`,
  options: {
    slots: labelsFor(cell).map((label, i) => ({ id: `s${i}`, label })),
    board: { rows: cell.rows },
    slotLabels: { layout: cell.layout, horizontalWhenFit: cell.horizontalWhenFit },
    ...extra.options,
  },
});

/** Mounts the cell's board in a context of its own (viewport, zoom, root font size). */
async function open({ browser, cell, extra }: OpenInput): Promise<Opened> {
  const context = await browser.newContext({
    viewport: viewportOf(cell),
    deviceScaleFactor: cell.zoom,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await recordText(page);
  await page.goto('/');
  await page.waitForFunction(() => window.harness !== undefined);
  await page.evaluate((s) => window.harness.mount(s), mountSpecOf(cell, extra));
  const canvasEl = page.locator('#host canvas');
  await expect(canvasEl).toBeVisible();
  const drawn = await lastFrameText(page);
  const canvas = await canvasEl.evaluate((el) => {
    const { width, height, right } = el.getBoundingClientRect();
    return { width, height, right };
  });
  const close = async () => {
    expect(errors).toEqual([]);
    await context.close();
  };
  const labels = slotLabelsIn({ drawn, names: labelsFor(cell) });
  return { page, labels, drawn, canvas, close };
}

interface LabelSearch {
  drawn: DrawnText[];
  names: string[];
}

/** The text is this label, whole or cut with "…". */
const isLabel = (t: DrawnText, name: string) =>
  t.text === name || (t.text.endsWith('…') && name.startsWith(t.text.slice(0, -1)));

/** The slot labels among the drawn text, in slot order. */
function slotLabelsIn({ drawn, names }: LabelSearch): DrawnText[] {
  let from = 0;
  const found = names.map((name) => {
    const at = drawn.findIndex((t, i) => i >= from && isLabel(t, name));
    from = at + 1;
    return drawn[at];
  });
  expect(
    found.map((t) => t?.text ?? '(missing)'),
    'every slot label drawn',
  ).not.toContain('(missing)');
  return found as DrawnText[];
}

const isCut = (t: DrawnText) => t.text.endsWith('…');

const cutLabels = (labels: DrawnText[]) => labels.filter(isCut).map((t) => t.text);

/** Every pair of labels whose boxes overlap, by text. */
const clashes = (labels: DrawnText[]): string[] =>
  labels.flatMap((t, i) =>
    labels
      .slice(i + 1)
      .filter((u) => overlaps({ p: t.box, q: u.box }))
      .map((u) => `${t.text} / ${u.text}`),
  );

/** Labels with a corner more than 1px outside the canvas. */
const outside = ({ labels, canvas }: Pick<Opened, 'labels' | 'canvas'>): string[] =>
  labels
    .filter((t) =>
      t.box.some((p) => p.x < -1 || p.y < -1 || p.x > canvas.width + 1 || p.y > canvas.height + 1),
    )
    .map((t) => t.text);

interface FloorCheck {
  labels: DrawnText[];
  rem: number;
}

/** Labels below the floor, with their size. */
const belowFloor = ({ labels, rem }: FloorCheck): string[] =>
  labels
    .filter((t) => t.size < FLOOR_REM * rem - EPS)
    .map((t) => `${t.text} @ ${t.size.toFixed(1)}px`);

/** A line of text across, in text sizes: the room the planner keeps between neighbouring labels. */
const LINE = 1.1;
/** A horizontal label cut to one character ("W…") at its widest, in text sizes. */
const CUT_LABEL = 1.8;

/**
 * The widest a slot could be on this canvas, CSS pixels: the board with no room taken past its
 * walls. Judged from the canvas, not from where labels landed, so a plan that wastes width on
 * that room can't excuse the overlap it causes.
 */
const widestSlot = ({ canvas, labels }: Opened) => canvas.width / (labels.length + 2 * SIDE);

/** How far a label is turned from horizontal, radians: 0 horizontal, π/2 vertical. */
function slantOf(t: DrawnText): number {
  const [p, q] = t.box as [Point, Point];
  return Math.abs(Math.atan2(q.y - p.y, q.x - p.x));
}

/**
 * Floor-size labels could stand apart on this canvas. Turned labels sit slot × sin(turn) apart;
 * horizontal ones need room for a cut label.
 */
function roomForFloor({ board, rem }: PlacementInput): boolean {
  const first = board.labels[0];
  if (!first) return true;
  const slant = slantOf(first);
  const floor = FLOOR_REM * rem;
  if (slant < 0.01) return widestSlot(board) >= CUT_LABEL * floor;
  return widestSlot(board) * Math.sin(slant) >= LINE * floor;
}

interface PlacementInput {
  board: Opened;
  rem: number;
}

interface Placement {
  outsideCanvas: string[];
  overlapping: string[];
}

/**
 * Labels outside the canvas or overlapping, where the board has room to avoid both. Where even
 * floor-size text is too wide for the slots, overlap is allowed (sizing.md): noted in the report.
 */
function placement({ board, rem }: PlacementInput): Placement {
  if (roomForFloor({ board, rem })) {
    return { outsideCanvas: outside(board), overlapping: clashes(board.labels) };
  }
  test.info().annotations.push({ type: 'too narrow', description: 'overlap allowed' });
  return { outsideCanvas: [], overlapping: [] };
}

// Sizes come from the cell, not the project, and one browser covers the matrix.
test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'desktop project only'));

test.describe('slot label sizing matrix', () => {
  for (const cell of pairwise()) {
    test(cellName(cell), async ({ browser }) => {
      const board = await open({ browser, cell });
      const { labels, canvas } = board;
      const view = viewportOf(cell);
      expect.soft(belowFloor({ labels, rem: cell.rem }), `below ${FLOOR_REM}rem`).toEqual([]);
      const { outsideCanvas, overlapping } = placement({ board, rem: cell.rem });
      expect.soft(outsideCanvas, 'outside the canvas').toEqual([]);
      expect.soft(overlapping, 'overlapping').toEqual([]);
      expect.soft(canvas.right, 'canvas right edge').toBeLessThanOrEqual(view.width + 1);
      // The board fits the screen's height (sizing.md); padding above it may push it past the fold.
      expect.soft(canvas.height, 'canvas height').toBeLessThanOrEqual(view.height + 1);
      await board.close();
    });
  }
});

test.describe('slot labels follow the font size and zoom', () => {
  const BASE: Cell = {
    slots: 5,
    rows: 8,
    labels: 'short',
    layout: 'vertical',
    horizontalWhenFit: false,
    viewport: '1280x800',
    rem: 16,
    zoom: 1,
  };

  /** Label sizes in device pixels, which is what grows for someone zoomed in. */
  async function deviceSizes(input: OpenInput): Promise<number[]> {
    const board = await open(input);
    await board.close();
    return board.labels.map((t) => t.size * input.cell.zoom);
  }

  const CHANGES: [string, Partial<Cell>][] = [
    ['a 32px root font size', { rem: 32 }],
    ['200% zoom', { zoom: 2 }],
  ];

  /** Short labels on a wide, low board: room for every label at twice the size. */
  const ROOMY: Cell = { ...BASE, labels: 'tiny', slots: 3, rows: 3, viewport: '1920x1080' };

  for (const layout of ['horizontal', 'vertical', 'backboard', 'angled'] as const) {
    for (const [name, change] of CHANGES) {
      test(`${layout}: ${name} doubles the label size`, async ({ browser }) => {
        const before = await deviceSizes({ browser, cell: { ...ROOMY, layout } });
        const after = await deviceSizes({ browser, cell: { ...ROOMY, layout, ...change } });
        const ratios = after.map((size, i) => size / (before[i] ?? Number.NaN));
        expect(Math.min(...ratios)).toBeGreaterThanOrEqual(2 - EPS);
      });
    }
  }

  // Regression: "Dark Mode" was drawn as "Dark m…" under the angled layout, because the plan
  // sized its strip for board-unit text and drawing then raised the text to the floor.
  for (const viewport of ['320x568', 'pixel7', '1280x800'] as const) {
    test(`angled, ${viewport}: "Dark Mode" isn't cut`, async ({ browser }) => {
      const board = await open({ browser, cell: { ...BASE, layout: 'angled', viewport } });
      await board.close();
      expect(cutLabels(board.labels)).toEqual([]);
    });
  }
});

test.describe('tray and banner text follow the font size', () => {
  /** Short labels on a wide, low board, with room for its text at twice the size. */
  const WIDE: Cell = {
    slots: 3,
    rows: 3,
    labels: 'tiny',
    layout: 'vertical',
    horizontalWhenFit: false,
    viewport: '1920x1080',
    rem: 16,
    zoom: 1,
  };
  const REQUEST_MORE = 'Enter: request more';
  /** One chip kind with none left: its caption and its "request more" note both show. */
  const EMPTY_TRAY: Extra = {
    options: { chips: [{ id: 'on', label: 'On', count: 0 }], styles: {} },
  };
  const isTray = (t: DrawnText) => t.text.includes('×') || t.text === REQUEST_MORE;

  /** Tray caption and note sizes, CSS pixels, at a root font size. */
  async function traySizes(input: OpenInput): Promise<number[]> {
    const board = await open(input);
    await board.close();
    const tray = board.drawn.filter(isTray);
    expect(tray.map((t) => t.text)).toEqual(['On ×0', REQUEST_MORE]);
    return tray.map((t) => t.size);
  }

  test('tray captions and notes double with a 32px root font size', async ({ browser }) => {
    const before = await traySizes({ browser, cell: WIDE, extra: EMPTY_TRAY });
    const after = await traySizes({ browser, cell: { ...WIDE, rem: 32 }, extra: EMPTY_TRAY });
    expect(after.map((size, i) => size / (before[i] ?? Number.NaN))).toEqual([
      expect.closeTo(2, 1),
      expect.closeTo(2, 1),
    ]);
    expect(Math.min(...before)).toBeGreaterThanOrEqual(FLOOR_REM * 16 - EPS);
  });

  /** The banner's size, CSS pixels, once the board locks with its only chip dropped. */
  async function bannerSize(input: OpenInput): Promise<number> {
    const board = await open(input);
    await board.page.evaluate(() => {
      window.harness
        .board()
        ?.drop()
        .catch(() => {});
    });
    const banner = (await lastFrameText(board.page)).find((t) => t.text === 'Board full');
    await board.close();
    return banner?.size ?? Number.NaN;
  }

  test('the full-board banner doubles with a 32px root font size', async ({ browser }) => {
    const extra: Extra = {
      options: {
        chips: [{ id: 'on', label: 'On', count: 1 }],
        styles: {},
        supply: { refill: { mode: 'never' } },
        labels: { locked: 'Board full' },
      },
    };
    const before = await bannerSize({ browser, cell: WIDE, extra });
    const after = await bannerSize({ browser, cell: { ...WIDE, rem: 32 }, extra });
    expect(after / before).toBeCloseTo(2, 1);
  });

  for (const viewport of ['pixel7', '1280x800'] as const) {
    test(`${viewport}, root font size 32px: tray text stays inside the canvas and apart`, async ({
      browser,
    }) => {
      const cell: Cell = { ...WIDE, labels: 'short', slots: 5, rows: 8, viewport, rem: 32 };
      const board = await open({ browser, cell, extra: EMPTY_TRAY });
      await board.close();
      const tray = board.drawn.filter(isTray);
      expect(outside({ labels: tray, canvas: board.canvas })).toEqual([]);
      expect(clashes([...board.labels, ...tray])).toEqual([]);
    });
  }

  // Changing the browser's font size setting resizes nothing the board otherwise watches when the
  // host's width doesn't depend on it, so the board has to notice the font size itself.
  test('a root font size change alone refits the board', async ({ browser }) => {
    const extra: Extra = { css: 'body { padding: 0; } #host { width: 600px; }' };
    const board = await open({ browser, cell: WIDE, extra });
    const before = board.labels.map((t) => t.size);
    await board.page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    const after = (await lastFrameText(board.page)).slice(0, before.length).map((t) => t.size);
    await board.close();
    expect(after.map((size, i) => size / (before[i] ?? Number.NaN))).toEqual(
      before.map(() => expect.closeTo(2, 1)),
    );
  });
});

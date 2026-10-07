import type { Browser, Page } from '@playwright/test';
import { SIDE } from '../src/runtime/view/geometry';
import { expect, test } from './fixtures';
import type { MountSpec } from './harness/harness';
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
  canvas: CanvasBox;
  close(): Promise<void>;
}

interface OpenInput {
  browser: Browser;
  cell: Cell;
}

const viewportOf = ({ viewport, zoom }: Cell) => ({
  width: Math.round(VIEWPORTS[viewport].width / zoom),
  height: Math.round(VIEWPORTS[viewport].height / zoom),
});

const mountSpecOf = (cell: Cell): MountSpec => ({
  css: `html { font-size: ${cell.rem}px; }`,
  options: {
    slots: labelsFor(cell).map((label, i) => ({ id: `s${i}`, label })),
    board: { rows: cell.rows },
    slotLabels: { layout: cell.layout, horizontalWhenFit: cell.horizontalWhenFit },
  },
});

/** Mounts the cell's board in a context of its own (viewport, zoom, root font size). */
async function open({ browser, cell }: OpenInput): Promise<Opened> {
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
  await page.evaluate((s) => window.harness.mount(s), mountSpecOf(cell));
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
  return { page, labels: slotLabelsIn({ drawn, names: labelsFor(cell) }), canvas, close };
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

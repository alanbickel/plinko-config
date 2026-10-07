// The text-size matrix: every pair of values across the factors below appears in at least one cell
// (greedy pairwise, deterministic). The unit tests cover the full cross product with a fake
// measure; this covers real fonts in real browsers.

export const LABEL_SETS = {
  short: ['Ads', 'Dark Mode', 'Map', 'Cookies', 'Wi-Fi', 'Sound', 'Tips'],
  long: [
    'Email Marketing',
    'Push Notifications',
    'Location History',
    'Personalised Ads',
    'Usage Analytics',
  ],
  mixed: ['Email Marketing', 'Dark Mode', 'Cookies', 'Push Notifications', 'Autoplay'],
  wide: ['WMWMWM', 'MMMM WWW', 'ＷＩＤＥ', 'Mmm Www'],
  // Not a matrix factor: labels short enough to have room at twice the size, for scaling checks.
  tiny: ['Ads', 'Map', 'Tips'],
} as const;

export type LabelSet = keyof typeof LABEL_SETS;
export type Layout = 'horizontal' | 'vertical' | 'backboard' | 'angled';

export const VIEWPORTS = {
  '320x568': { width: 320, height: 568 },
  pixel7: { width: 412, height: 839 },
  'ipad-portrait': { width: 810, height: 1080 },
  'ipad-landscape': { width: 1080, height: 810 },
  '1280x800': { width: 1280, height: 800 },
  '1920x1080': { width: 1920, height: 1080 },
  '1280x520': { width: 1280, height: 520 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

const FACTORS = {
  slots: [2, 5, 9, 15, 25],
  rows: [3, 8, 16],
  labels: ['short', 'long', 'mixed', 'wide'] as LabelSet[],
  layout: ['horizontal', 'vertical', 'backboard', 'angled'] as Layout[],
  horizontalWhenFit: [true, false],
  viewport: Object.keys(VIEWPORTS) as ViewportName[],
  /** Root font size, CSS pixels (the browser's font-size setting). */
  rem: [16, 20, 32],
  /** Browser zoom: viewport ÷ zoom and deviceScaleFactor × zoom. */
  zoom: [1, 2],
};

type Factors = typeof FACTORS;
export type Cell = { [K in keyof Factors]: Factors[K][number] };

/** Labels for a cell: the set, repeated to fill the slots. */
export const labelsFor = (cell: Cell): string[] =>
  Array.from({ length: cell.slots }, (_, i) => {
    const set = LABEL_SETS[cell.labels];
    return set[i % set.length] as string;
  });

export const cellName = (c: Cell): string =>
  `${c.slots} slots ${c.rows} rows, ${c.labels}, ${c.layout}${c.horizontalWhenFit ? '' : ' strict'}, ` +
  `${c.viewport}, rem ${c.rem}${c.zoom > 1 ? `, zoom ${c.zoom}` : ''}`;

// --- pairwise ---------------------------------------------------------------------------------
// Greedy over the whole space (about 20,000 cells): each round takes the cell covering the most
// pairs not yet covered, the first on a tie, so the cells are the same every run.

type Factor = keyof Factors;

const KEYS = Object.keys(FACTORS) as Factor[];

/** Every combination of factor values. */
const everyCell = (): Cell[] =>
  KEYS.reduce<Partial<Cell>[]>(
    (cells, key) =>
      cells.flatMap((c) => (FACTORS[key] as readonly unknown[]).map((v) => ({ ...c, [key]: v }))),
    [{}],
  ) as Cell[];

/** Each pair of factor values a cell holds, as a string key. */
const pairsOf = (cell: Cell): string[] =>
  KEYS.flatMap((a, i) => KEYS.slice(i + 1).map((b) => `${a}=${cell[a]}|${b}=${cell[b]}`));

interface Scored {
  cell: Cell;
  pairs: string[];
}

/** The candidate covering the most uncovered pairs. */
function best(candidates: Scored[], uncovered: Set<string>): Scored | undefined {
  const score = (c: Scored) => c.pairs.filter((p) => uncovered.has(p)).length;
  let top: Scored | undefined;
  let topScore = 0;
  for (const c of candidates) {
    const s = score(c);
    if (s > topScore) [top, topScore] = [c, s];
  }
  return top;
}

/** Cells such that every pair of factor values appears in at least one. */
export function pairwise(): Cell[] {
  const candidates = everyCell().map((cell) => ({ cell, pairs: pairsOf(cell) }));
  const uncovered = new Set(candidates.flatMap((c) => c.pairs));
  const cells: Cell[] = [];
  for (let next = best(candidates, uncovered); next; next = best(candidates, uncovered)) {
    for (const p of next.pairs) uncovered.delete(p);
    cells.push(next.cell);
  }
  return cells;
}

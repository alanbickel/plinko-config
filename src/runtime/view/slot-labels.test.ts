import { describe, expect, it } from 'vitest';
import { buildLayout, type Layout } from '../../core/layout';
import { DEFAULT_BOARD } from '../../core/options';
import type { ResolvedText } from '../styles';
import { SIDE } from './geometry';
import {
  drawSlotLabels,
  drawText,
  type FittedText,
  fitText,
  type LabelPlan,
  type Measure,
  measureLabels,
  planSlotLabels,
  type SlotLabelLayout,
} from './slot-labels';

// Stand-in font metrics: most characters are 0.55 of the font size wide, W and M 0.9, fullwidth
// characters 1. The fake 2D context below measures the same way, so plan and drawing agree.
const WIDE: Record<string, number> = { W: 0.9, M: 0.9 };
const charWidth = (c: string) => WIDE[c] ?? (c.charCodeAt(0) > 0xff00 ? 1 : 0.55);
const widthOf = (text: string) => [...text].reduce((sum, c) => sum + charWidth(c), 0);
const measure: Measure = ({ text, size }) => widthOf(text) * size;
const style: ResolvedText = { color: '#fff', fontFamily: 'sans-serif', fontWeight: '400' };

const fontPx = (font: string) => Number(/([\d.]+)px/.exec(font)?.[1] ?? 0);

/** Just enough of a 2D context for fitText: measures with the same stand-in metrics. */
function fakeContext(): CanvasRenderingContext2D {
  const g = {
    font: '',
    measureText: (text: string) => ({ width: widthOf(text) * fontPx(g.font) }),
  };
  return g as unknown as CanvasRenderingContext2D;
}

interface Recording {
  g: CanvasRenderingContext2D;
  /** Each fillText: the text, and its size in board units after every scale in effect. */
  drawn: FittedText[];
}

/** A 2D context that records what drawSlotLabels draws, so the tests see what reaches the canvas. */
function recordingContext(): Recording {
  const drawn: FittedText[] = [];
  const saved: number[] = [];
  let scale = 1;
  const g = {
    font: '',
    measureText: (text: string) => ({ width: widthOf(text) * fontPx(g.font) }),
    save: () => saved.push(scale),
    restore: () => {
      scale = saved.pop() ?? 1;
    },
    translate: () => {},
    rotate: () => {},
    scale: (by: number) => {
      scale *= by;
    },
    fillText: (text: string) => drawn.push({ text, size: fontPx(g.font) * scale }),
  };
  return { g: g as unknown as CanvasRenderingContext2D, drawn };
}

// --- the sizing contract (site/contracts/sizing.md) -------------------------------------------

/** Label text size and the floor no text goes under, rem. */
const NORMAL_REM = 0.875;
const FLOOR_REM = 0.75;
/** Vertical and angled strips stop growing at this share of the board, drop line to floor. */
const STRIP_SHARE = 0.5;
/** Share of a slot a horizontal label may use. */
const CELL = 0.92;
const ANGLE = (40 * Math.PI) / 180;
/** A line of text across, in text sizes: the room neighbouring labels need. */
const LINE = 1.1;
/** Rounding slack, CSS pixels. */
const EPS = 1e-6;

const LABEL_SETS: Record<string, string[]> = {
  short: ['Ads', 'Dark Mode', 'Map', 'Cookies', 'Wi-Fi', 'Sound', 'Tips'],
  long: ['Email Marketing', 'Push Notifications', 'Location History', 'Personalised Ads'],
  mixed: ['Email Marketing', 'Dark Mode', 'Cookies', 'Push Notifications', 'Autoplay'],
  wide: ['WMWMWM', 'MMMM WWW', 'ＷＩＤＥ', 'Mmm Www'],
};
const LAYOUTS: SlotLabelLayout[] = ['horizontal', 'vertical', 'backboard', 'angled'];
const SLOTS = [2, 5, 9, 15, 25];
const ROWS = [3, 8, 16];
const REMS = [16, 20, 32];
/** Canvas widths, CSS pixels: phones (zoomed and not) up to wide desktops. */
const WIDTHS = [160, 206, 288, 380, 608, 778, 1048, 1248, 1888];

interface CaseInput {
  set: string;
  slots: number;
  rows: number;
  /** The layout asked for (the plan may fall back to horizontal). */
  asked: SlotLabelLayout;
  strict: boolean;
  rem: number;
  cssWidth: number;
}

/** One plan in the cross product, and every label as drawn from it. */
interface Case extends CaseInput {
  name: string;
  labels: string[];
  layout: Layout;
  plan: LabelPlan;
  drawn: FittedText[];
}

const nameOf = (c: CaseInput) =>
  `${c.set} ×${c.slots}, ${c.rows} rows, ${c.asked}${c.strict ? ' strict' : ''}, ` +
  `rem ${c.rem}, ${c.cssWidth}px`;

function makeCase(input: CaseInput): Case {
  const { set, slots, rows, asked, strict, rem, cssWidth } = input;
  const pool = LABEL_SETS[set] ?? [];
  const labels = Array.from({ length: slots }, (_, i) => pool[i % pool.length] as string);
  const layout = buildLayout(slots, { ...DEFAULT_BOARD, rows });
  const widths = measureLabels({ labels, styles: labels.map(() => style), measure });
  const options = { layout: asked, horizontalWhenFit: !strict };
  const plan = planSlotLabels({ widths, options, layout, remPx: rem, cssWidth });
  const { g, drawn } = recordingContext();
  drawSlotLabels({ g, plan, labels, styles: labels.map(() => style), layout, stripTop: 0 });
  return { ...input, name: nameOf(input), labels, layout, plan, drawn };
}

/** The full cross product: about 13,000 plans, by name. */
const CASES = new Map(
  Object.keys(LABEL_SETS)
    .flatMap((set) =>
      SLOTS.flatMap((slots) =>
        ROWS.flatMap((rows) =>
          LAYOUTS.flatMap((asked) =>
            [false, true].flatMap((strict) =>
              REMS.flatMap((rem) =>
                WIDTHS.map((cssWidth) =>
                  makeCase({ set, slots, rows, asked, strict, rem, cssWidth }),
                ),
              ),
            ),
          ),
        ),
      ),
    )
    .map((c) => [c.name, c]),
);

/** Names of the cases that break a rule, with how many; the first few are enough to debug from. */
function breaking(rule: (c: Case) => boolean): string[] {
  const broken = [...CASES.values()].filter((c) => !rule(c));
  if (broken.length === 0) return [];
  return [`${broken.length} of ${CASES.size}`, ...broken.slice(0, 5).map((c) => c.name)];
}

const px = (c: Case, boardUnits: number) => boardUnits * c.plan.unit;
const isCut = (t: FittedText) => t.text.endsWith('…');
/** The strip's cap, CSS pixels. */
const capOf = (c: Case) => px(c, STRIP_SHARE * (c.layout.floorY - c.layout.spawnY));
const atCap = (c: Case) => px(c, c.plan.strip.height) >= capOf(c) - 1e-3;
const grows = (c: Case) => c.plan.mode === 'vertical' || c.plan.mode === 'angled';
/** Room between neighbouring labels per board unit of slot width: angled ones are closer. */
const SPACING = (c: Case) => (c.plan.mode === 'angled' ? Math.sin(ANGLE) : 1);
/** Room between neighbouring labels, CSS pixels. */
const room = (c: Case) => SPACING(c) * c.plan.unit;
const planned = (c: Case) => px(c, c.plan.size);
/** Neighbours are exactly a line apart: text was shrunk (or cut, angled) until they were. */
const tight = (c: Case) => Math.abs(room(c) - LINE * planned(c)) < 1e-3;
/** Floor-size text could keep neighbours apart on this board (an upper bound for angled). */
const possible = (c: Case) =>
  SPACING(c) * (c.cssWidth / (c.layout.width + 2 * SIDE)) >= LINE * FLOOR_REM * c.rem;

describe('planSlotLabels: the sizing contract, across the cross product', () => {
  it('never draws a label under 0.75rem', () => {
    const rule = (c: Case) => c.drawn.every((t) => px(c, t.size) >= FLOOR_REM * c.rem - EPS);
    expect(breaking(rule)).toEqual([]);
  });

  it('plans text at 0.875rem, shrinking toward the floor only to fit its strip or slots', () => {
    const normal = (c: Case) => Math.abs(planned(c) - NORMAL_REM * c.rem) < EPS;
    const floor = (c: Case) => Math.abs(planned(c) - FLOOR_REM * c.rem) < EPS && !possible(c);
    const why = (c: Case) => (grows(c) && atCap(c)) || (c.plan.mode !== 'horizontal' && tight(c));
    const shrunk = (c: Case) => planned(c) < NORMAL_REM * c.rem && (why(c) || floor(c));
    expect(breaking((c) => normal(c) || shrunk(c))).toEqual([]);
  });

  it('keeps neighbouring labels a line apart, wherever the floor size can be', () => {
    const apart = (c: Case) => c.drawn.every((t) => room(c) >= LINE * px(c, t.size) - 1e-3);
    const rule = (c: Case) => c.plan.mode === 'horizontal' || !possible(c) || apart(c);
    expect(breaking(rule)).toEqual([]);
  });

  // Regression: drawing raised text to the floor after planning, so it outgrew the planned extent
  // and was cut ("Dark Mode" drawn as "Dark M…" under the angled layout).
  it('draws every label at the planned size or smaller, never larger', () => {
    expect(breaking((c) => c.drawn.every((t) => t.size <= c.plan.size + EPS))).toEqual([]);
  });

  it('vertical and angled: cuts a label only once its strip is full or neighbours would touch', () => {
    const why = (c: Case) => atCap(c) || tight(c);
    expect(breaking((c) => !grows(c) || !c.drawn.some(isCut) || why(c))).toEqual([]);
  });

  it('vertical and angled: the strip never grows past its share of the board', () => {
    const rule = (c: Case) => !grows(c) || px(c, c.plan.strip.height) <= capOf(c) + 1e-3;
    expect(breaking(rule)).toEqual([]);
  });

  it('fills the canvas width exactly, label room included', () => {
    const width = (c: Case) => px(c, c.layout.width + 2 * (SIDE + c.plan.strip.extraRight));
    expect(breaking((c) => Math.abs(width(c) - c.cssWidth) < 1e-6)).toEqual([]);
  });

  // Measured on the planned run: past the strip's cap a label is cut to fit it, except that a cut
  // label keeps one character, which far outside the supported range can be longer still.
  it('angled: the room past the wall holds the last label', () => {
    const fits = (c: Case) => {
      const run = c.plan.extent * Math.cos(ANGLE) + c.plan.size * Math.sin(ANGLE);
      return c.layout.width - 0.6 + run <= c.layout.width + SIDE + c.plan.strip.extraRight + EPS;
    };
    expect(breaking((c) => c.plan.mode !== 'angled' || fits(c))).toEqual([]);
  });

  it('horizontalWhenFit: horizontal exactly when every label fits its slot at 0.875rem', () => {
    const fits = (c: Case) =>
      c.labels.every((l) => widthOf(l) * NORMAL_REM * c.rem <= CELL * c.plan.unit);
    const free = (c: Case) => !c.strict && (c.asked === 'vertical' || c.asked === 'angled');
    expect(breaking((c) => !free(c) || (c.plan.mode === 'horizontal') === fits(c))).toEqual([]);
  });

  it('doubles the label size from rem 16 to rem 32 wherever the larger text fits', () => {
    const bigOf = (c: Case) => CASES.get(nameOf({ ...c, rem: 32 })) as Case;
    /** At rem 32 the plan keeps the normal size and every label fits its room whole. */
    const fitsBig = (big: Case) =>
      Math.abs(px(big, big.plan.size) - NORMAL_REM * 32) < EPS &&
      big.labels.every((l) => widthOf(l) * big.plan.size <= big.plan.extent);
    const roomy = (c: Case) => c.rem === 16 && fitsBig(bigOf(c));
    const doubles = (c: Case) =>
      c.drawn.every(
        (t, i) => px(bigOf(c), bigOf(c).drawn[i]?.size ?? 0) >= 2 * px(c, t.size) - EPS,
      );
    expect(breaking((c) => !roomy(c) || doubles(c))).toEqual([]);
    // Not vacuous: thousands of cases have room to double.
    expect([...CASES.values()].filter(roomy).length).toBeGreaterThan(1000);
  });
});

describe('planSlotLabels: layouts', () => {
  const pick = (input: Omit<CaseInput, 'rows' | 'rem'>) =>
    CASES.get(nameOf({ rows: 8, rem: 16, ...input })) as Case;
  const short = { set: 'short', slots: 2, cssWidth: 1248 };
  const long = { set: 'long', slots: 5, cssWidth: 778, strict: false };

  it('uses one horizontal line while every label fits, when allowed', () => {
    expect(pick({ ...short, asked: 'vertical', strict: false }).plan.mode).toBe('horizontal');
    expect(pick({ ...short, asked: 'angled', strict: false }).plan.mode).toBe('horizontal');
    expect(pick({ ...long, asked: 'vertical' }).plan.mode).toBe('vertical');
  });

  it('honours the layout exactly when horizontalWhenFit is off, and always for backboard', () => {
    expect(pick({ ...short, asked: 'vertical', strict: true }).plan.mode).toBe('vertical');
    expect(pick({ ...short, asked: 'angled', strict: true }).plan.mode).toBe('angled');
    expect(pick({ ...short, asked: 'backboard', strict: false }).plan.mode).toBe('backboard');
  });

  it('angled: leaves room past the right wall for the last label', () => {
    expect(pick({ ...long, asked: 'angled' }).plan.strip.extraRight).toBeGreaterThan(0);
  });

  it('backboard: labels run within the slot, with only a thin strip below', () => {
    const backboard = pick({ ...long, asked: 'backboard' });
    const horizontal = pick({ ...long, asked: 'horizontal' });
    expect(backboard.plan.extent).toBeLessThan(backboard.layout.floorY - backboard.layout.railTopY);
    expect(backboard.plan.strip.height).toBeLessThan(horizontal.plan.strip.height);
  });
});

describe('fitText', () => {
  const g = fakeContext();

  it('keeps text that fits at its size', () => {
    expect(fitText({ g, text: 'Ads', style, size: 0.26, maxWidth: 1, minSize: 0.1 })).toEqual({
      text: 'Ads',
      size: 0.26,
    });
  });

  it('shrinks text to fit, but never below the minimum', () => {
    const shrunk = fitText({ g, text: 'Cookies!', style, size: 0.26, maxWidth: 0.9, minSize: 0.1 });
    expect(shrunk.text).toBe('Cookies!');
    expect(shrunk.size).toBeLessThan(0.26);
    expect(shrunk.size).toBeGreaterThanOrEqual(0.1);
  });

  it('cuts text with an ellipsis once it would go below the minimum', () => {
    const cut = fitText({
      g,
      text: 'Push Notifications',
      style,
      size: 0.26,
      maxWidth: 0.9,
      minSize: 0.2,
    });
    expect(cut.size).toBe(0.2);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.text.length * cut.size * 0.55).toBeLessThanOrEqual(0.9);
  });
});

describe('drawText', () => {
  // Firefox draws nothing for fonts under 1px, whatever the transform.
  it('never hands the canvas a font under 1px, and scales back to the board-unit size', () => {
    const drawn: { font: string; scale: number }[] = [];
    let scale = 1;
    const g = {
      font: '',
      save() {},
      restore() {
        scale = 1;
      },
      scale(by: number) {
        scale *= by;
      },
      fillText() {
        drawn.push({ font: g.font, scale });
      },
    };
    drawText(g as unknown as CanvasRenderingContext2D, {
      text: 'Ads',
      size: 0.26,
      style,
      align: 'center',
    });
    const [call] = drawn;
    const px = Number(/([\d.]+)px/.exec(call?.font ?? '')?.[1]);
    expect(px).toBeGreaterThanOrEqual(1);
    expect(px * (call?.scale ?? 0)).toBeCloseTo(0.26);
  });
});

// Slot labels under (or on) the board. A board-wide layout decides where they go; the plan sizes
// the label strip, which feeds the board's geometry. Text is sized in rem and never shrinks below
// MIN_TEXT_REM; past each layout's space limit it's cut with an ellipsis.

import type { Layout } from '../../core/layout';
import { fontOf, type ResolvedText } from '../styles';
import { LABEL_REM, type LabelStrip, MIN_TEXT_REM, SIDE } from './geometry';

/**
 * Where slot labels go. `'horizontal'`: one line under each slot. `'vertical'`: under each slot,
 * reading top to bottom. `'backboard'`: printed on each slot's back wall, behind the chips.
 * `'angled'`: under each slot, slanting down to the right.
 */
export type SlotLabelLayout = 'horizontal' | 'vertical' | 'backboard' | 'angled';

/** How slot labels are laid out, for the whole board. */
export interface SlotLabelOptions {
  /** Default `'vertical'`. */
  layout?: SlotLabelLayout;
  /**
   * Use one horizontal line under each slot while every label fits at the normal size, and the
   * chosen layout only when one doesn't. Default true. Ignored for `'horizontal'` and
   * `'backboard'`. Set false to always use `layout` as given.
   */
  horizontalWhenFit?: boolean;
}

export type ResolvedSlotLabels = Required<SlotLabelOptions>;

/** The slot label layout used for anything you leave out of `slotLabels`. */
export const DEFAULT_SLOT_LABELS: Required<SlotLabelOptions> = {
  layout: 'vertical',
  horizontalWhenFit: true,
};

/** Share of a slot's width a horizontal label may use. */
const CELL = 0.92;
/** Horizontal strip height, in text sizes. */
const HORIZONTAL_STRIP = 2.7;
/** Space around vertical and angled labels in their strip, in text sizes. */
const PAD = 1.15;
/** Vertical and angled strips stop growing at this share of the board, drop line to floor. */
const STRIP_SHARE = 0.5;
const ANGLE = (40 * Math.PI) / 180;
/** Angled labels start this far into their slot, board units. */
const ANGLED_X = 0.4;
const BACKBOARD_STRIP = 0.25;
const QUARTER_TURN = Math.PI / 2;
/** Halvings when shrinking text into a strip: far finer than a pixel. */
const SHRINK_STEPS = 40;
/** A line of text across, in text sizes: neighbouring labels need this much room to stay apart. */
const LINE = 1.1;
/** Room between neighbouring labels per board unit of slot width, by layout. */
const SPACING: Record<SlotLabelLayout, number> = {
  horizontal: 1,
  vertical: 1,
  backboard: 1,
  angled: Math.sin(ANGLE),
};

/** Some text at a size, to measure. */
export interface MeasureInput {
  text: string;
  style: ResolvedText;
  size: number;
}

/** Measures text, in the unit of size. */
export type Measure = (input: MeasureInput) => number;

export interface MeasureLabelsInput {
  labels: readonly string[];
  /** Label style per slot (font), parallel to labels. */
  styles: readonly ResolvedText[];
  measure: Measure;
}

/** Each label's width at font size 1 (text width scales with size), parallel to the labels. */
export function measureLabels(input: MeasureLabelsInput): number[] {
  const { labels, styles, measure } = input;
  return labels.map((text, i) => (styles[i] ? measure({ text, style: styles[i], size: 1 }) : 0));
}

/** How the labels will be drawn: the layout in effect, the text size, and the strip it needs. */
export interface LabelPlan {
  mode: SlotLabelLayout;
  /** Text size, board units. */
  size: number;
  /** Smallest size text may shrink to before it's cut, board units. */
  minSize: number;
  strip: LabelStrip;
  /** Longest a label may run, board units; longer ones are cut with "…". */
  extent: number;
  /** CSS pixels per board unit at this canvas width. */
  unit: number;
}

export interface PlanInput {
  /** From measureLabels. */
  widths: readonly number[];
  options: ResolvedSlotLabels;
  layout: Layout;
  /** CSS pixels per rem: the root font size. */
  remPx: number;
  /** Canvas width, CSS pixels. */
  cssWidth: number;
}

/**
 * Plans the labels for a canvas width. Text is sized in rem and measured in CSS pixels; the board
 * gets whatever width the labels leave it, and the plan comes back in board units for drawing.
 */
export function planSlotLabels(input: PlanInput): LabelPlan {
  const px = pxOf(input);
  const { layout, horizontalWhenFit } = input.options;
  const fallBack = horizontalWhenFit && layout !== 'backboard';
  const allFit = input.widths.every((w) => w * px.normal <= CELL * px.unit);
  const plan = PLANS[fallBack && allFit ? 'horizontal' : layout](px);
  return toBoardUnits(plan, px.floor);
}

/** What every layout plans from, CSS pixels. */
interface Px {
  layout: Layout;
  cssWidth: number;
  /** The longest label's width at font size 1. */
  longest: number;
  /** Normal text size, and the size it never shrinks below. */
  normal: number;
  floor: number;
  /** CSS pixels per board unit with no room past the walls. */
  unit: number;
}

const pxOf = ({ widths, layout, remPx, cssWidth }: PlanInput): Px => ({
  layout,
  cssWidth,
  longest: Math.max(0, ...widths),
  normal: LABEL_REM * remPx,
  floor: MIN_TEXT_REM * remPx,
  unit: cssWidth / (layout.width + 2 * SIDE),
});

/** A plan in CSS pixels. */
interface PxPlan {
  mode: SlotLabelLayout;
  size: number;
  height: number;
  extraRight: number;
  extent: number;
  unit: number;
}

const toBoardUnits = ({ mode, size, height, extraRight, extent, unit }: PxPlan, floor: number) => ({
  mode,
  size: size / unit,
  minSize: floor / unit,
  strip: { height: height / unit, extraRight: extraRight / unit },
  extent: extent / unit,
  unit,
});

const PLANS: Record<SlotLabelLayout, (px: Px) => PxPlan> = {
  horizontal: ({ normal, unit }) => ({
    mode: 'horizontal',
    size: normal,
    height: HORIZONTAL_STRIP * normal,
    extraRight: 0,
    extent: CELL * unit,
    unit,
  }),
  vertical: (px) => planStrip(px, verticalAt),
  angled: (px) => planStrip(px, angledAt),
  backboard: (px) => {
    const { layout, unit } = px;
    const size = apartSize(px);
    const extent = Math.max(0, (layout.floorY - layout.railTopY) * unit - PAD * size);
    return { mode: 'backboard', size, height: BACKBOARD_STRIP * unit, extraRight: 0, extent, unit };
  },
};

// --- strips that grow with their labels (vertical, angled) -------------------------------------

/** Text of a size, running a length (its longest label, possibly cut), CSS pixels. */
interface Run {
  size: number;
  run: number;
}

/** A strip's plan for a run of text. */
type StripAt = (px: Px, text: Run) => PxPlan;

const verticalAt: StripAt = ({ unit }, { size, run }) => ({
  mode: 'vertical',
  size,
  height: run + PAD * size,
  extraRight: 0,
  extent: run,
  unit,
});

/** The last label runs past the right wall; the board gets the width that leaves. */
const angledAt: StripAt = ({ layout, cssWidth, unit }, { size, run }) => {
  const overhang = run * Math.cos(ANGLE) + size * Math.sin(ANGLE);
  const credit = 1 - ANGLED_X;
  // Room past the wall is overhang - credit × unit, and the unit depends on that room.
  const tight = (cssWidth - 2 * overhang) / (layout.width + 2 * SIDE - 2 * credit);
  const roomy = overhang <= credit * unit;
  const u = roomy ? unit : tight;
  const extraRight = roomy ? 0 : overhang - credit * u;
  const height = run * Math.sin(ANGLE) + PAD * size;
  return { mode: 'angled', size, height, extraRight, extent: run, unit: u };
};

/** The strip's height limit, CSS pixels. */
const capOf = (px: Px, plan: PxPlan) =>
  STRIP_SHARE * (px.layout.floorY - px.layout.spawnY) * plan.unit;

/** Neighbouring labels have a line's room between them. */
const apart = (plan: PxPlan) => SPACING[plan.mode] * plan.unit >= LINE * plan.size;

/** Backboard text: the normal size, or smaller toward the floor when slots are narrow. */
const apartSize = ({ normal, floor, unit }: Px) =>
  Math.max(floor, Math.min(normal, (SPACING.backboard * unit) / LINE));

/**
 * Whole labels at the normal size if they fit: the strip within its cap, and neighbours apart.
 * Else smaller, down to the floor; else at the floor, cut to what fits. Smaller text and shorter
 * runs mean a shorter strip and a wider board, so the largest that fits is found by halving. Where
 * even the floor can't keep neighbours apart, labels stay at the floor and overlap least.
 */
function planStrip(px: Px, at: StripAt): PxPlan {
  const hopeless = !apart(at(px, { size: px.floor, run: 0 }));
  const fits = (plan: PxPlan) =>
    plan.unit > 0 &&
    plan.height <= capOf(px, plan) &&
    (apart(plan) || (hopeless && plan.size <= px.floor));
  const whole = (size: number) => at(px, { size, run: px.longest * size });
  if (fits(whole(px.normal))) return whole(px.normal);
  if (fits(whole(px.floor))) {
    return whole(largest({ from: px.floor, to: px.normal, fits: (s) => fits(whole(s)) }));
  }
  const cut = (run: number) => at(px, { size: px.floor, run });
  const plan = cut(largest({ from: 0, to: px.longest * px.floor, fits: (r) => fits(cut(r)) }));
  // Even an empty strip may not fit a tiny board: then it just takes the cap.
  return { ...plan, height: Math.min(plan.height, capOf(px, plan)) };
}

interface Search {
  from: number;
  to: number;
  /** True at from, false at to, and switching once between them. */
  fits: (value: number) => boolean;
}

/** The largest value between from and to that fits, by halving. */
function largest({ from, to, fits }: Search): number {
  let [lo, hi] = [from, to];
  for (let i = 0; i < SHRINK_STEPS; i++) {
    const mid = (lo + hi) / 2;
    [lo, hi] = fits(mid) ? [mid, hi] : [lo, mid];
  }
  return lo;
}

// --- drawing ---------------------------------------------------------------------------------

export interface DrawLabelsInput {
  g: CanvasRenderingContext2D;
  plan: LabelPlan;
  labels: readonly string[];
  styles: readonly ResolvedText[];
  layout: Layout;
  /** Top of the label strip, board units. */
  stripTop: number;
}

/** One label's placement: where it starts, how it's turned, how it's aligned. */
interface Placement {
  x: number;
  y: number;
  rotate: number;
  align: CanvasTextAlign;
}

type Place = (input: DrawLabelsInput, index: number) => Placement;

const PLACES: Record<SlotLabelLayout, Place> = {
  horizontal: ({ stripTop, plan }, i) => ({
    x: i + 0.5,
    y: stripTop + plan.strip.height / 2,
    rotate: 0,
    align: 'center',
  }),
  vertical: ({ stripTop, plan }, i) => ({
    x: i + 0.5,
    y: stripTop + (PAD * plan.size) / 2,
    rotate: QUARTER_TURN,
    align: 'left',
  }),
  angled: ({ stripTop, plan }, i) => ({
    x: i + ANGLED_X,
    y: stripTop + (PAD * plan.size) / 2,
    rotate: ANGLE,
    align: 'left',
  }),
  backboard: ({ layout, plan }, i) => ({
    x: i + 0.5,
    y: layout.railTopY + (PAD * plan.size) / 2,
    rotate: QUARTER_TURN,
    align: 'left',
  }),
};

/** Backboard labels sit behind the chips, so they're drawn quieter. */
const BACKBOARD_ALPHA = 0.55;

/** Draws every slot label for the plan. Backboard labels are drawn before the chips, by the caller. */
export function drawSlotLabels(input: DrawLabelsInput): void {
  const { g, plan, labels, styles } = input;
  labels.forEach((text, i) => {
    const style = styles[i];
    if (!style) return;
    const place = PLACES[plan.mode](input, i);
    const fitted = fitText({
      g,
      text,
      style,
      size: plan.size,
      maxWidth: plan.extent,
      minSize: plan.minSize,
    });
    g.save();
    g.translate(place.x, place.y);
    g.rotate(place.rotate);
    g.globalAlpha = plan.mode === 'backboard' ? BACKBOARD_ALPHA : 1;
    drawText(g, { ...fitted, style, align: place.align });
    g.restore();
  });
}

export interface FitInput {
  g: CanvasRenderingContext2D;
  text: string;
  style: ResolvedText;
  /** Size to start from; shrunk toward minSize until the text fits. */
  size: number;
  maxWidth: number;
  minSize: number;
}

export interface FittedText {
  text: string;
  size: number;
}

/**
 * Fonts are set this many times larger than their board-unit size, and drawing scales back down:
 * Firefox draws nothing for fonts under 1px, whatever the transform.
 */
const FONT_MAGNIFY = 100;

type FontInput = Omit<MeasureInput, 'text'>;

/** Sets the font for text of the given size, board units. Pair with textWidth and drawText. */
export function setFont(g: CanvasRenderingContext2D, { style, size }: FontInput): void {
  g.font = fontOf(style, size * FONT_MAGNIFY);
}

/** Width of text in the font from setFont, board units. */
export const textWidth = (g: CanvasRenderingContext2D, text: string): number =>
  g.measureText(text).width / FONT_MAGNIFY;

/** Shrinks text to fit, never below minSize; then cuts it with an ellipsis if it still doesn't. */
export function fitText({ g, text, style, size, maxWidth, minSize }: FitInput): FittedText {
  setFont(g, { style, size });
  const width = textWidth(g, text);
  const fitting = width > maxWidth ? (size * maxWidth) / width : size;
  const finalSize = Math.max(minSize, Math.min(size, fitting));
  setFont(g, { style, size: finalSize });
  return { text: ellipsize(g, { text, maxWidth }), size: finalSize };
}

interface EllipsizeInput {
  text: string;
  maxWidth: number;
}

/** Text sized to fit exactly can measure a hair over its room from rounding; it still fits. */
const ROUNDING = 1 + 1e-9;

/** Cuts text with an ellipsis to fit maxWidth in the current font. */
function ellipsize(g: CanvasRenderingContext2D, { text, maxWidth }: EllipsizeInput): string {
  if (textWidth(g, text) <= maxWidth * ROUNDING) return text;
  let t = text;
  while (t.length > 1 && textWidth(g, `${t}…`) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

interface TextDraw extends FittedText {
  style: ResolvedText;
  align: CanvasTextAlign;
}

/** Draws fitted text at the origin of the current transform. */
export function drawText(
  g: CanvasRenderingContext2D,
  { text, size, style, align }: TextDraw,
): void {
  setFont(g, { style, size });
  g.fillStyle = style.color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.save();
  g.scale(1 / FONT_MAGNIFY, 1 / FONT_MAGNIFY);
  g.fillText(text, 0, 0);
  g.restore();
}

// Slot labels under (or on) the board. A board-wide layout decides where they go; the plan sizes
// the label strip, which feeds the board's geometry. Text never shrinks below MIN_TEXT_PX on
// screen; past each layout's space limit it's cut with an ellipsis.

import type { Layout } from '../../core/layout';
import { fontOf, type ResolvedText } from '../styles';
import type { LabelStrip } from './geometry';

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

/** No canvas text is drawn smaller than this, in CSS pixels (WCAG sets none; Material's smallest). */
export const MIN_TEXT_PX = 12;

/** Normal text size, board units. */
export const TEXT_SIZE = 0.26;
/** Width a horizontal label may use, board units (a slot is 1). */
const CELL = 0.92;
const HORIZONTAL_STRIP = 0.7;
/** Space around vertical and angled labels in their strip. */
const PAD = 0.3;
/** Vertical and angled strips never grow past this, board units. */
const MAX_STRIP = 3;
/** Vertical text is bounded by the strip, not the slot width, so it can be larger. */
const MAX_VERTICAL_SIZE = 0.4;
const ANGLE = (40 * Math.PI) / 180;
const BACKBOARD_SIZE = 0.3;
const BACKBOARD_STRIP = 0.25;
const QUARTER_TURN = Math.PI / 2;

/** Some text at a size, to measure. */
export interface MeasureInput {
  text: string;
  style: ResolvedText;
  size: number;
}

/** Measures text, board units. */
export type Measure = (input: MeasureInput) => number;

/** How the labels will be drawn: the layout in effect, the text size, and the strip it needs. */
export interface LabelPlan {
  mode: SlotLabelLayout;
  size: number;
  strip: LabelStrip;
  /** Longest a label may run, board units; longer ones are cut with "…". */
  extent: number;
}

export interface PlanInput {
  labels: readonly string[];
  /** Label style per slot (font), parallel to labels. */
  styles: readonly ResolvedText[];
  options: ResolvedSlotLabels;
  layout: Layout;
  measure: Measure;
}

export function planSlotLabels(input: PlanInput): LabelPlan {
  const { options } = input;
  const fallBack = options.horizontalWhenFit && options.layout !== 'backboard';
  const mode = fallBack && allFit(input) ? 'horizontal' : options.layout;
  return PLANS[mode](input);
}

/** Every label fits one line in its slot at the normal size. */
function allFit({ labels, styles, measure }: PlanInput): boolean {
  return labels.every((text, i) => fitsAt({ text, style: styles[i], size: TEXT_SIZE, measure }));
}

interface FitCheck {
  text: string;
  style: ResolvedText | undefined;
  size: number;
  measure: Measure;
}

const fitsAt = ({ text, style, size, measure }: FitCheck): boolean =>
  style !== undefined && measure({ text, style, size }) <= CELL;

/** Width of the longest label at size 1. */
function longestAtUnit({ labels, styles, measure }: PlanInput): number {
  return Math.max(
    0,
    ...labels.map((text, i) => (styles[i] ? measure({ text, style: styles[i], size: 1 }) : 0)),
  );
}

const PLANS: Record<SlotLabelLayout, (input: PlanInput) => LabelPlan> = {
  horizontal: () => ({
    mode: 'horizontal',
    size: TEXT_SIZE,
    strip: { height: HORIZONTAL_STRIP, extraRight: 0 },
    extent: CELL,
  }),
  vertical: (input) => {
    const longest = longestAtUnit(input);
    const size = Math.min(MAX_VERTICAL_SIZE, (MAX_STRIP - PAD) / Math.max(longest, 1e-6));
    const height = Math.min(longest * size + PAD, MAX_STRIP);
    return { mode: 'vertical', size, strip: { height, extraRight: 0 }, extent: height - PAD };
  },
  angled: (input) => {
    const extent = Math.min(longestAtUnit(input) * TEXT_SIZE, MAX_STRIP / Math.sin(ANGLE));
    const height = extent * Math.sin(ANGLE) + PAD;
    // The last label runs past the right wall; leave room for it.
    const extraRight = Math.max(0, extent * Math.cos(ANGLE) - 0.4);
    return { mode: 'angled', size: TEXT_SIZE, strip: { height, extraRight }, extent };
  },
  backboard: ({ layout }) => ({
    mode: 'backboard',
    size: BACKBOARD_SIZE,
    strip: { height: BACKBOARD_STRIP, extraRight: 0 },
    extent: layout.floorY - layout.railTopY - PAD,
  }),
};

// --- drawing ---------------------------------------------------------------------------------

export interface DrawLabelsInput {
  g: CanvasRenderingContext2D;
  plan: LabelPlan;
  labels: readonly string[];
  styles: readonly ResolvedText[];
  layout: Layout;
  /** Top of the label strip, board units. */
  stripTop: number;
  /** MIN_TEXT_PX in board units at the current size. */
  minSize: number;
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
  horizontal: ({ stripTop }, i) => ({
    x: i + 0.5,
    y: stripTop + HORIZONTAL_STRIP / 2,
    rotate: 0,
    align: 'center',
  }),
  vertical: ({ stripTop }, i) => ({
    x: i + 0.5,
    y: stripTop + PAD / 2,
    rotate: QUARTER_TURN,
    align: 'left',
  }),
  angled: ({ stripTop }, i) => ({ x: i + 0.4, y: stripTop + 0.12, rotate: ANGLE, align: 'left' }),
  backboard: ({ layout }, i) => ({
    x: i + 0.5,
    y: layout.railTopY + 0.15,
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
      minSize: input.minSize,
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

/** Shrinks text to fit, never below minSize; then cuts it with an ellipsis if it still doesn't. */
export function fitText({ g, text, style, size, maxWidth, minSize }: FitInput): FittedText {
  g.font = fontOf(style, size);
  const width = g.measureText(text).width;
  const fitting = width > maxWidth ? (size * maxWidth) / width : size;
  const finalSize = Math.max(minSize, Math.min(size, fitting));
  g.font = fontOf(style, finalSize);
  return { text: ellipsize(g, { text, maxWidth }), size: finalSize };
}

interface EllipsizeInput {
  text: string;
  maxWidth: number;
}

/** Cuts text with an ellipsis to fit maxWidth in the current font. */
function ellipsize(g: CanvasRenderingContext2D, { text, maxWidth }: EllipsizeInput): string {
  if (g.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
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
  g.font = fontOf(style, size);
  g.fillStyle = style.color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
}

// Per-slot and per-chip looks, layered over the board-wide theme. Kept apart from slot and chip
// data so a live board can be restyled with update() (slots and chips themselves are mount-only).

import { check } from '../core/validate';
import type { Theme } from './theme';

/** How a piece of canvas text looks. Its size is fitted to the space, so it isn't styleable. */
export interface TextStyle {
  /** Any CSS colour. */
  color?: string;
  /** A CSS font-family list, e.g. "Inter, sans-serif". */
  fontFamily?: string;
  /** A CSS font-weight, e.g. 600 or "bold". */
  fontWeight?: string | number;
}

/** How one slot looks. */
export interface SlotStyle {
  /** Tint behind the slot's column and label (any CSS colour; use alpha for subtlety). */
  fill?: string;
  /** The slot's label under the board. */
  label?: TextStyle;
}

/** How one chip kind looks, on the board and in the tray. */
export interface ChipStyle {
  /** The chip's colour (any CSS colour), on the board and in the tray. Defaults to the theme's `chip`. */
  fill?: string;
  /** Outline, so chips stay distinct from each other and the background. */
  stroke?: string;
  /** The kind's caption in the tray. Its colour shows while the kind is selected; others are muted. */
  label?: TextStyle;
}

/** Per-item looks, keyed by slot and chip id. Anything left out falls back to the theme. */
export interface Styles {
  /** Every canvas text: slot labels, tray captions and notes, the full-board banner. */
  text?: TextStyle;
  /** Looks for particular slots, keyed by slot id. Slots not listed keep the theme. */
  slots?: Record<string, SlotStyle>;
  /** Looks for particular chip kinds, keyed by chip id. Kinds not listed keep the theme. */
  chips?: Record<string, ChipStyle>;
}

/** A text style with nothing left to fall back on. */
export interface ResolvedText {
  color: string;
  fontFamily: string;
  fontWeight: string;
}

export interface ResolvedSlotStyle {
  /** Undefined: no tint. */
  fill: string | undefined;
  label: ResolvedText;
}

export interface ResolvedChipStyle {
  fill: string;
  stroke: string;
  label: ResolvedText;
}

export interface ResolvedStyles {
  text: ResolvedText;
  /** Muted text (unselected kinds, notes) keeps the theme's colour, in the board-wide font. */
  mutedText: ResolvedText;
  /** By slot index. */
  slots: ResolvedSlotStyle[];
  /** By chip kind index. */
  chips: ResolvedChipStyle[];
}

export interface ResolveStylesInput {
  styles: Styles | undefined;
  theme: Theme;
  slotIds: readonly string[];
  chipIds: readonly string[];
}

const DEFAULT_FONT_FAMILY = 'system-ui, sans-serif';
const DEFAULT_FONT_WEIGHT = '400';

/** Applies the theme underneath. Throws PlinkoConfigError for ids that aren't on the board. */
export function resolveStyles({
  styles = {},
  theme,
  slotIds,
  chipIds,
}: ResolveStylesInput): ResolvedStyles {
  checkIds({ given: styles.slots, known: slotIds, what: 'slots' });
  checkIds({ given: styles.chips, known: chipIds, what: 'chips' });
  const text = textOver(
    { color: theme.text, fontFamily: DEFAULT_FONT_FAMILY, fontWeight: DEFAULT_FONT_WEIGHT },
    styles.text,
  );
  return {
    text,
    mutedText: { ...text, color: theme.mutedText },
    slots: slotIds.map((id) => slotStyle(styles.slots?.[id], text)),
    chips: chipIds.map((id) => chipStyle({ style: styles.chips?.[id], theme, text })),
  };
}

interface IdCheck {
  given: Record<string, unknown> | undefined;
  known: readonly string[];
  what: 'slots' | 'chips';
}

/** A typo in an id would otherwise style nothing, silently. */
function checkIds({ given, known, what }: IdCheck): void {
  const unknown = Object.keys(given ?? {}).filter((id) => !known.includes(id));
  check(
    unknown.length === 0,
    `styles.${what} has no ${what.slice(0, -1)} with id ${unknown.join(', ')}`,
  );
}

function textOver(base: ResolvedText, style: TextStyle | undefined): ResolvedText {
  return {
    color: style?.color ?? base.color,
    fontFamily: style?.fontFamily ?? base.fontFamily,
    fontWeight: String(style?.fontWeight ?? base.fontWeight),
  };
}

function slotStyle(style: SlotStyle | undefined, text: ResolvedText): ResolvedSlotStyle {
  return { fill: style?.fill, label: textOver(text, style?.label) };
}

interface ChipStyleInput {
  style: ChipStyle | undefined;
  theme: Theme;
  text: ResolvedText;
}

function chipStyle({ style, theme, text }: ChipStyleInput): ResolvedChipStyle {
  return {
    fill: style?.fill ?? theme.chip,
    stroke: style?.stroke ?? theme.chipStroke,
    label: textOver(text, style?.label),
  };
}

/** A canvas font string. Sizes are in board units, since the canvas is scaled to the board. */
export const fontOf = (text: ResolvedText, size: number): string =>
  `${text.fontWeight} ${size}px ${text.fontFamily}`;

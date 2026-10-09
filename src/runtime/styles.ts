// Per-slot and per-chip looks, layered over the board-wide theme. Kept apart from slot and chip
// data so a live board can be restyled with update() (slots and chips themselves are mount-only).

import { check } from '../core/validate';
import type { Theme } from './theme';

/**
 * How a piece of the board's text looks. There's no size: the board sizes text in rem, so it
 * follows the page's font size. Slot labels that don't fit shrink, down to 0.75rem, and are then
 * shortened with an ellipsis.
 */
export interface TextStyle {
  /** Any CSS color. */
  color?: string;
  /** A CSS font-family list, such as `"Inter, sans-serif"`. */
  fontFamily?: string;
  /** A CSS font-weight, such as `600` or `'bold'`. */
  fontWeight?: string | number;
}

/** How one slot looks. */
export interface SlotStyle {
  /**
   * A tint behind the slot's column, from the rail tops to the floor. Any CSS color; a
   * translucent one keeps pegs and chips easy to see.
   */
  fill?: string;
  /** The slot's label, wherever `slotLabels` puts it. */
  label?: TextStyle;
}

/** How one chip kind looks, on the board and in the tray. */
export interface ChipStyle {
  /**
   * The chip's color (any CSS color), on the board and in the tray.
   *
   * @defaultValue the theme's `chip`
   */
  fill?: string;
  /**
   * The chip's outline, which keeps chips distinct from each other and the background.
   *
   * @defaultValue the theme's `chipStroke`
   */
  stroke?: string;
  /**
   * The kind's caption in the tray. Its color is used while the kind is selected; the other
   * captions use the theme's `mutedText`.
   */
  label?: TextStyle;
}

/**
 * The `styles` option: fonts for the board's text, and looks for particular slots and chip kinds
 * (keyed by id). Anything left out comes from the theme.
 */
export interface Styles {
  /**
   * Font and color for all of the board's text: slot labels, tray captions and notes, and the
   * full-board banner. A slot's or chip kind's own `label` style overrides it.
   */
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
  /** Muted text (unselected kinds, notes) keeps the theme's color, in the board-wide font. */
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

/** Colours for the canvas. Resolved from options.theme, then --plinko-* CSS properties, then defaults. */
export interface Theme {
  /** Behind the board. */
  background: string;
  /** The side walls and the bumps set into them. */
  wall: string;
  /** Pegs at rest. */
  peg: string;
  /** A peg's flash when a chip hits it. Not shown with reduced motion. */
  pegHit: string;
  /** The rails between slots. */
  rail: string;
  /** Chips whose kind has no colour. */
  chip: string;
  /** Chip outline, so chips stay distinct from each other and the background. */
  chipStroke: string;
  /** Slot labels, the selected tray chip's label, and the "board is full" banner text. */
  text: string;
  /** Other tray labels and notes; the ring around the selected chip when the tray isn't focused. */
  mutedText: string;
  /** The keyboard focus ring, drawn on the canvas. */
  focus: string;
  /** Behind the chip tray. */
  tray: string;
  /** Where a held chip can be dropped from: outline and glow. */
  dropZone: string;
  /** Background of the "board is full" banner. */
  overlay: string;
}

/** The built-in dark theme. Its text and focus colours meet WCAG AA contrast (≥ 4.5:1). */
export const DEFAULT_THEME: Theme = {
  background: '#11151c',
  wall: '#3b4553',
  peg: '#9aa4b2',
  pegHit: '#ffd166',
  rail: '#5c6b7e',
  chip: '#ffb347',
  chipStroke: '#0b0e13',
  text: '#e6e9ee',
  mutedText: '#a3adbb',
  focus: '#7cc4ff',
  tray: '#1a2029',
  dropZone: '#ffd166',
  overlay: 'rgba(17, 21, 28, 0.88)',
};

/** --plinko-chip-stroke style names for each key. */
const cssName = (key: string) => `--plinko-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export function resolveTheme(
  partial: Partial<Theme> | undefined,
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'> | undefined,
): Theme {
  const theme = { ...DEFAULT_THEME };
  for (const key of Object.keys(theme) as (keyof Theme)[]) {
    const fromCss = style?.getPropertyValue(cssName(key)).trim();
    theme[key] = partial?.[key] ?? (fromCss || theme[key]);
  }
  return theme;
}

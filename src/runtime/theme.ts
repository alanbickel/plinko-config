/** Colours for the canvas. Resolved from options.theme, then --plinko-* CSS properties, then defaults. */
export interface Theme {
  background: string;
  wall: string;
  peg: string;
  pegHit: string;
  rail: string;
  /** Chips whose kind has no colour. */
  chip: string;
  /** Chip outline, so chips stay distinct from each other and the background. */
  chipStroke: string;
  text: string;
  mutedText: string;
  focus: string;
  tray: string;
  /** Background of the "board is full" banner. */
  overlay: string;
}

// Text and focus colours meet WCAG AA (≥ 4.5:1) against the background.
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

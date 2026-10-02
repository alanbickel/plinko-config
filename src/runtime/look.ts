// The board's colours and fonts: the theme (options, then --plinko-* CSS properties, then
// defaults) with per-slot and per-chip styles layered on top. Resolved at mount and on update().

import { resolveStyles } from './styles';
import { resolveTheme } from './theme';
import type { PlinkoOptions } from './types';
import type { Look } from './view/canvas';

export interface LookInput {
  options: PlinkoOptions;
  /** The element whose CSS custom properties feed the theme. */
  host: HTMLElement;
  win: Window | null;
}

/** Throws PlinkoConfigError if styles name a slot or chip that isn't on the board. */
export function resolveLook({ options, host, win }: LookInput): Look {
  const theme = resolveTheme(options.theme, win?.getComputedStyle(host));
  const styles = resolveStyles({
    styles: options.styles,
    theme,
    slotIds: options.slots.map((slot) => slot.id),
    chipIds: options.chips.map((chip) => chip.id),
  });
  return { theme, styles };
}

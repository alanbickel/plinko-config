// Key → action, depending on the keyboard zone. Pure: the board applies the actions and owns the
// DOM listener. Keys that aren't bound return null, so Tab always leaves the canvas.

/** KeyboardEvent.key values per action. ' ' is the space bar. */
export interface KeyBindings {
  left: string[];
  right: string[];
  /** Jump to the left edge. */
  home: string[];
  /** Jump to the right edge. */
  end: string[];
  pickUp: string[];
  drop: string[];
  cancel: string[];
}

export const DEFAULT_KEYS: KeyBindings = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  home: ['Home'],
  end: ['End'],
  pickUp: ['Enter', ' '],
  drop: ['Enter', ' ', 'ArrowDown'],
  cancel: ['Escape'],
};

/** Tray: choosing a kind. Board: aiming and dropping. */
export type Zone = 'tray' | 'board';

export interface KeyContext {
  zone: Zone;
  holding: boolean;
  /** Index of the selected kind in the tray. */
  selected: number;
  kindCount: number;
  /** Kind to pick up when Enter is pressed on the board with nothing held. */
  lastKindIndex: number | undefined;
  aimStep: number;
  aimStepLarge: number;
}

export type KeyAction =
  | { type: 'select'; index: number }
  | { type: 'pickUp'; index: number }
  | { type: 'nudge'; dx: number }
  | { type: 'aim'; x: number }
  | { type: 'drop' }
  | { type: 'cancel' }
  | { type: 'zone'; zone: Zone };

export interface KeyInput {
  key: string;
  shiftKey: boolean;
}

export function interpretKey(
  input: KeyInput,
  ctx: KeyContext,
  keys: KeyBindings = DEFAULT_KEYS,
): KeyAction | null {
  const is = (action: keyof KeyBindings) => keys[action].includes(input.key);

  if (ctx.zone === 'tray') {
    if (is('left') || is('right')) {
      const dir = is('left') ? -1 : 1;
      const index = (ctx.selected + dir + ctx.kindCount) % ctx.kindCount;
      return { type: 'select', index };
    }
    if (is('pickUp')) return { type: 'pickUp', index: ctx.selected };
    return null;
  }

  if (ctx.holding) {
    if (is('left') || is('right')) {
      const step = input.shiftKey ? ctx.aimStepLarge : ctx.aimStep;
      return { type: 'nudge', dx: is('left') ? -step : step };
    }
    if (is('home')) return { type: 'aim', x: 0 };
    if (is('end')) return { type: 'aim', x: 1 };
    if (is('drop')) return { type: 'drop' };
    if (is('cancel')) return { type: 'cancel' };
    return null;
  }

  // Board zone with nothing held, e.g. after a drop without auto-reload.
  if (is('pickUp')) return { type: 'pickUp', index: ctx.lastKindIndex ?? ctx.selected };
  if (is('cancel')) return { type: 'zone', zone: 'tray' };
  return null;
}

/** Fills in defaults for any actions the host didn't rebind. */
export function resolveKeys(partial: Partial<KeyBindings> | undefined): KeyBindings {
  return { ...DEFAULT_KEYS, ...partial };
}

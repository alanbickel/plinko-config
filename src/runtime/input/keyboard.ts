// Key → action, depending on whether a chip is held. Pure: the board applies the actions and
// owns the DOM listener. Keys that aren't bound return null, so Tab always leaves the canvas.

import type { InputAction } from './actions';

/** KeyboardEvent.key values per action. ' ' is the space bar. */
export interface KeyBindings {
  left: string[];
  right: string[];
  /** Carry the held chip up, toward the drop zone. */
  up: string[];
  /** Carry the held chip down, toward the tray. */
  down: string[];
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
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  home: ['Home'],
  end: ['End'],
  pickUp: ['Enter', ' '],
  drop: ['Enter', ' '],
  cancel: ['Escape'],
};

export interface KeyContext {
  holding: boolean;
  /** Index of the selected kind in the tray. */
  selected: number;
  kindCount: number;
  aimStep: number;
  aimStepLarge: number;
  liftStep: number;
  liftStepLarge: number;
  keys: KeyBindings;
}

export interface KeyInput {
  key: string;
  shiftKey: boolean;
}

type Binding = keyof KeyBindings;
type Resolver = (input: KeyInput, ctx: KeyContext) => InputAction;
/** Bound actions in priority order: the first binding that matches the key wins. */
type ActionTable = readonly (readonly [Binding, Resolver])[];
type Mode = 'tray' | 'holding';

const selectBy =
  (dir: number): Resolver =>
  (_, ctx) => ({ type: 'select', index: (ctx.selected + dir + ctx.kindCount) % ctx.kindCount });

const nudgeBy =
  (dir: number): Resolver =>
  (input, ctx) => ({ type: 'nudge', dx: dir * (input.shiftKey ? ctx.aimStepLarge : ctx.aimStep) });

const liftBy =
  (dir: number): Resolver =>
  (input, ctx) => ({ type: 'lift', dy: dir * (input.shiftKey ? ctx.liftStepLarge : ctx.liftStep) });

const TABLES: Record<Mode, ActionTable> = {
  tray: [
    ['left', selectBy(-1)],
    ['right', selectBy(1)],
    ['pickUp', (_, ctx) => ({ type: 'pickUp', index: ctx.selected })],
  ],
  holding: [
    ['left', nudgeBy(-1)],
    ['right', nudgeBy(1)],
    ['up', liftBy(1)],
    ['down', liftBy(-1)],
    ['home', () => ({ type: 'aim', x: 0 })],
    ['end', () => ({ type: 'aim', x: 1 })],
    // Outside the drop zone this loses the chip. No warning: that's the joke.
    ['drop', () => ({ type: 'drop', reload: true })],
    ['cancel', () => ({ type: 'cancel' })],
  ],
};

export function interpretKey(input: KeyInput, ctx: KeyContext): InputAction | null {
  const match = TABLES[modeOf(ctx)].find(([binding]) => ctx.keys[binding].includes(input.key));
  return match ? match[1](input, ctx) : null;
}

const modeOf = (ctx: KeyContext): Mode => (ctx.holding ? 'holding' : 'tray');

/** Fills in defaults for any actions the host didn't rebind. */
export function resolveKeys(partial: Partial<KeyBindings> | undefined): KeyBindings {
  return { ...DEFAULT_KEYS, ...partial };
}

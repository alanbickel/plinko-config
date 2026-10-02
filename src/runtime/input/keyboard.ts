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
  keys: KeyBindings;
}

export interface KeyInput {
  key: string;
  shiftKey: boolean;
}

export interface SelectAction {
  type: 'select';
  index: number;
}
export interface PickUpAction {
  type: 'pickUp';
  index: number;
}
export interface NudgeAction {
  type: 'nudge';
  dx: number;
}
export interface AimAction {
  type: 'aim';
  x: number;
}
export interface DropAction {
  type: 'drop';
}
export interface CancelAction {
  type: 'cancel';
}
export interface ZoneAction {
  type: 'zone';
  zone: Zone;
}

/** Every key action, keyed by its type. */
export interface KeyActionByType {
  select: SelectAction;
  pickUp: PickUpAction;
  nudge: NudgeAction;
  aim: AimAction;
  drop: DropAction;
  cancel: CancelAction;
  zone: ZoneAction;
}

export type KeyAction = KeyActionByType[keyof KeyActionByType];

type Binding = keyof KeyBindings;
type Resolver = (input: KeyInput, ctx: KeyContext) => KeyAction;
/** Bound actions in priority order: the first binding that matches the key wins. */
type ActionTable = readonly (readonly [Binding, Resolver])[];
type Mode = 'tray' | 'holding' | 'emptyHanded';

const selectBy =
  (dir: number): Resolver =>
  (_, ctx) => ({ type: 'select', index: (ctx.selected + dir + ctx.kindCount) % ctx.kindCount });

const nudgeBy =
  (dir: number): Resolver =>
  (input, ctx) => ({ type: 'nudge', dx: dir * (input.shiftKey ? ctx.aimStepLarge : ctx.aimStep) });

const TABLES: Record<Mode, ActionTable> = {
  tray: [
    ['left', selectBy(-1)],
    ['right', selectBy(1)],
    ['pickUp', (_, ctx) => ({ type: 'pickUp', index: ctx.selected })],
  ],
  holding: [
    ['left', nudgeBy(-1)],
    ['right', nudgeBy(1)],
    ['home', () => ({ type: 'aim', x: 0 })],
    ['end', () => ({ type: 'aim', x: 1 })],
    ['drop', () => ({ type: 'drop' })],
    ['cancel', () => ({ type: 'cancel' })],
  ],
  // Board zone with nothing held, e.g. after a drop without auto-reload.
  emptyHanded: [
    ['pickUp', (_, ctx) => ({ type: 'pickUp', index: ctx.lastKindIndex ?? ctx.selected })],
    ['cancel', () => ({ type: 'zone', zone: 'tray' })],
  ],
};

export function interpretKey(input: KeyInput, ctx: KeyContext): KeyAction | null {
  const match = TABLES[modeOf(ctx)].find(([binding]) => ctx.keys[binding].includes(input.key));
  return match ? match[1](input, ctx) : null;
}

function modeOf(ctx: KeyContext): Mode {
  if (ctx.zone === 'tray') return 'tray';
  return ctx.holding ? 'holding' : 'emptyHanded';
}

/** Fills in defaults for any actions the host didn't rebind. */
export function resolveKeys(partial: Partial<KeyBindings> | undefined): KeyBindings {
  return { ...DEFAULT_KEYS, ...partial };
}

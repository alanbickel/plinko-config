// Everything one board shares between its parts, plus small helpers that read it.

import type { ChipKindConfig, SlotConfig } from '../core/types';
import type { World, WorldEvent } from '../core/world';
import type { CommandMachine, HoldingState } from './commands';
import type { RuntimeConfig } from './config';
import type { Zone } from './input/keyboard';
import type { FrameLoop } from './loop';
import type { PlinkoOptions, Settled } from './types';
import type { Announcer } from './view/a11y';
import type { CanvasView } from './view/canvas';
import type { BoardDom } from './view/dom';

/** Mutable UI state that isn't the held-chip state machine. */
export interface UiState {
  zone: Zone;
  /** Index of the selected kind in the tray. */
  selected: number;
  focused: boolean;
  pausedByHost: boolean;
  offscreen: boolean;
  /** Seed for the next spawn, set only while drop({ seed }) runs. */
  pendingSeed: number | undefined;
  /** Shown over the board once it's full. */
  lockedMessage: string | undefined;
  /** performance.now() of each peg's latest hit. */
  pegHits: Map<number, number>;
  lastPegHit: number;
}

export interface BoardContext {
  host: HTMLElement;
  win: Window | null;
  /** The host's options, including its (untrusted) callbacks. */
  options: PlinkoOptions;
  config: RuntimeConfig;
  slots: readonly SlotConfig<unknown>[];
  chips: readonly ChipKindConfig<unknown>[];
  kindIds: readonly string[];
  world: World;
  dom: BoardDom;
  view: CanvasView;
  announcer: Announcer;
  machine: CommandMachine;
  loop: FrameLoop;
  ui: UiState;
  /** drop() promises waiting for their chip to settle, by drop id. */
  settling: Map<number, (settled: Settled) => void>;
  /** Stepped but not yet dispatched (events go out after stepping, never mid-step). */
  events: WorldEvent[];
}

export function initialUiState(): UiState {
  return {
    zone: 'tray',
    selected: 0,
    focused: false,
    pausedByHost: false,
    offscreen: false,
    pendingSeed: undefined,
    lockedMessage: undefined,
    pegHits: new Map(),
    lastPegHit: -Infinity,
  };
}

/** Host callbacks are untrusted: a throwing callback must not break the board. */
export function callHost<T>(callback: ((details: T) => void) | undefined, details: T): void {
  try {
    callback?.(details);
  } catch (err) {
    console.error('plinko-config: a callback threw', err);
  }
}

/** The configured chip kind for an id. Ids come from the board itself, so they always exist. */
export function kindOf(ctx: BoardContext, id: string): ChipKindConfig<unknown> {
  return ctx.chips[ctx.kindIds.indexOf(id)] as ChipKindConfig<unknown>;
}

export function heldChip(ctx: BoardContext): HoldingState | undefined {
  const state = ctx.machine.state;
  return state.name === 'holding' ? state : undefined;
}

/** After any change: mirror state on the wrapper and draw. */
export function refresh(ctx: BoardContext): void {
  ctx.dom.wrapper.dataset.state = ctx.machine.state.name;
  ctx.dom.wrapper.dataset.zone = ctx.ui.zone;
  ctx.loop.wake();
  ctx.loop.redraw();
}

/** Announces the kind selected in the tray. */
export function announceSelected(ctx: BoardContext): void {
  const chip = ctx.chips[ctx.ui.selected];
  if (chip) ctx.announcer.say(ctx.config.labels.selected({ chip }));
}

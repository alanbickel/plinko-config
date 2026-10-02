// Everything one board shares between its parts, plus small helpers that read it.

import type { Supply } from '../core/supply';
import type { ChipKindConfig, SlotConfig } from '../core/types';
import type { World, WorldEvent } from '../core/world';
import type { CommandMachine, HoldingState } from './commands';
import type { RuntimeConfig } from './config';
import type { Zone } from './input/keyboard';
import type { StockLabelInput } from './labels';
import type { FrameLoop } from './loop';
import type { FullReason, PlinkoOptions, RequestAnswer, Settled } from './types';
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
  /** Set once the board locks, so onFull fires exactly once whichever trigger comes first. */
  lockReason: FullReason | undefined;
  /** Last snapshot reported to onSupplyChange, to skip reports when nothing changed. */
  lastSupplyReport: string | undefined;
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
  supply: Supply;
  /** Requests for more chips waiting on the host, by kind. */
  requests: Map<string, Promise<RequestAnswer>>;
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
    lockReason: undefined,
    lastSupplyReport: undefined,
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

/** A kind and its stock, for announcements. */
export function stockOf(ctx: BoardContext, kindId: string): StockLabelInput {
  return {
    chip: kindOf(ctx, kindId),
    count: ctx.supply.count(kindId),
    canRequest: ctx.supply.canRequest(kindId),
  };
}

/** Announces the kind selected in the tray, with how many are left. */
export function announceSelected(ctx: BoardContext): void {
  const kindId = ctx.kindIds[ctx.ui.selected];
  if (kindId) ctx.announcer.say(ctx.config.labels.selected(stockOf(ctx, kindId)));
}

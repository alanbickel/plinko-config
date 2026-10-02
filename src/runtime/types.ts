import type { AddChips, RefillPolicy, SetCount, SupplySnapshot } from '../core/supply';
import type { ChipKindConfig, CoreOptions, SlotConfig } from '../core/types';
import type { KeyBindings } from './input/keyboard';
import type { Labels } from './labels';
import type { Theme } from './theme';

// Callbacks take one object each, so new fields never break existing hosts.

export interface ChipDetails<CV = unknown> {
  chip: ChipKindConfig<CV>;
}

export interface DropDetails<CV = unknown> extends ChipDetails<CV> {
  /** Correlates onDrop, onPegHit, onLand / onMiss, and the drop() promise. */
  dropId: number;
  /** 0..1 across the top of the board. */
  dropX: number;
}

export interface PegHitDetails<CV = unknown> extends DropDetails<CV> {
  pegIndex: number;
  /** Impact speed, board units per second. Handy for scaling a sound. */
  speed: number;
}

export interface MissDetails<CV = unknown> extends DropDetails<CV> {
  pegHits: number;
  /** Simulated fall time. */
  durationMs: number;
  /** Replays this exact drop when passed to drop({ seed }) with nothing else in flight. */
  seed: number;
}

export interface LandDetails<CV = unknown, SV = unknown> extends MissDetails<CV> {
  slot: SlotConfig<SV>;
}

/**
 * Why the board locked: every slot filled, the pile reached the drop line, or every chip is
 * spent with no way to get more.
 */
export type FullReason = 'slots' | 'overflow' | 'exhausted';

export interface FullDetails {
  reason: FullReason;
}

/** The host's answer to a request for more chips. 'grant' refills the kind up to its cap. */
export type RequestAnswer = 'grant' | 'deny';

export interface SupplyOptions {
  /** How spent chips come back. Default { mode: 'never' }. */
  refill?: RefillPolicy;
}

/** What drop() resolves with: only that the chip is no longer in flight. */
export interface Settled {
  dropId: number;
}

export interface PlinkoOptions<CV = unknown, SV = unknown> extends CoreOptions<CV, SV> {
  /** Chips allowed in flight at once. Default Infinity. */
  maxInFlight?: number;
  /** After a drop, pick up another chip of the same kind at the same spot. Default true. */
  autoReload?: boolean;
  /** Arrow-key step, as a fraction of the drop width, in (0, 1]. Default ¼ slot. */
  aimStep?: number;
  /** Shift+arrow step, as a fraction of the drop width, in (0, 1]. Default 1 slot. */
  aimStepLarge?: number;
  keys?: Partial<KeyBindings>;
  theme?: Partial<Theme>;
  labels?: Partial<Labels>;
  /** "Powered by LittleJS" link under the board. Default true. */
  attribution?: boolean;
  /** Chip counts come from each chip kind's `count` (default Infinity). */
  supply?: SupplyOptions;

  onPickUp?: (details: ChipDetails<CV>) => void;
  onDrop?: (details: DropDetails<CV>) => void;
  onPegHit?: (details: PegHitDetails<CV>) => void;
  /** The chip came to rest in a slot. The only signal that a preference should change. */
  onLand?: (details: LandDetails<CV, SV>) => void;
  /** The chip settled without reaching a slot (e.g. on top of an overflowing pile). */
  onMiss?: (details: MissDetails<CV>) => void;
  /** The board is full and locked. Fires once. */
  onFull?: (details: FullDetails) => void;
  /** Chip counts changed. Save this and pass it back as `count` to keep supply across loads. */
  onSupplyChange?: (snapshot: SupplySnapshot) => void;
  /** The last chip of a kind was dropped. */
  onExhausted?: (details: ChipDetails<CV>) => void;
  /**
   * With refill mode 'onRequest': someone asked for more chips of an empty kind. Answer
   * 'grant' or 'deny', now or later (a promise). Without this callback, requests are granted.
   */
  onRequest?: (details: ChipDetails<CV>) => RequestAnswer | Promise<RequestAnswer>;
}

export interface DropOptions {
  /** Kind to drop; picks it up first if needed. Defaults to the held or last-used kind. */
  chip?: string;
  /** Where to drop, 0..1. Defaults to the current aim. */
  x?: number;
  /** Replay a drop exactly (see MissDetails.seed / LandDetails.seed). */
  seed?: number;
}

export interface SupplyRequest {
  chip: string;
}

/** The host's view of the chip supply. Changes fire onSupplyChange. */
export interface SupplyController {
  get(): SupplySnapshot;
  /** Sets a count outright, ignoring the refill cap. */
  set(update: SetCount): void;
  /** Adds (or with a negative amount, removes) chips, ignoring the refill cap. */
  add(update: AddChips): void;
  /** Asks for more chips of an empty kind, as the tray's "request more" does. */
  request(request: SupplyRequest): Promise<RequestAnswer>;
}

export interface PlinkoBoard {
  /** Picks up a chip of this kind. False if the kind is unknown, none are left, or the board is locked. */
  pickUp(chipId: string): boolean;
  /** Moves the held chip, 0..1. */
  aim(x: number): void;
  /** Drops a chip. Rejects if nothing can be dropped (locked, too many in flight, unknown kind). */
  drop(options?: DropOptions): Promise<Settled>;
  /** Puts the held chip back in the tray. */
  cancel(): void;
  readonly supply: SupplyController;
  /** Freezes the simulation and rendering. */
  pause(): void;
  resume(): void;
  /** Removes everything the board added: DOM, listeners, observers, timers, the frame loop. */
  destroy(): void;
  /** The wrapper element appended inside the target. */
  readonly element: HTMLElement;
}

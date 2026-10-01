import type { ChipKindConfig, CoreOptions, SlotConfig } from '../core/types';
import type { KeyBindings } from './input/keyboard';
import type { Labels } from './labels';
import type { Theme } from './theme';

export interface DropDetails {
  /** Correlates onDrop, onPegHit, onLand / onMiss, and the drop() promise. */
  dropId: number;
  /** 0..1 across the top of the board. */
  dropX: number;
}

export interface PegHitDetails extends DropDetails {
  pegIndex: number;
  /** Impact speed, board units per second. Handy for scaling a sound. */
  speed: number;
}

export interface SettleDetails extends DropDetails {
  pegHits: number;
  /** Simulated fall time. */
  durationMs: number;
  /** Replays this exact drop when passed to drop({ seed }) with nothing else in flight. */
  seed: number;
}

export type FullReason = 'slots' | 'overflow';

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

  onPickUp?: (chip: ChipKindConfig<CV>) => void;
  onDrop?: (chip: ChipKindConfig<CV>, details: DropDetails) => void;
  onPegHit?: (chip: ChipKindConfig<CV>, details: PegHitDetails) => void;
  /** The chip came to rest in a slot. The only signal that a preference should change. */
  onLand?: (chip: ChipKindConfig<CV>, slot: SlotConfig<SV>, details: SettleDetails) => void;
  /** The chip settled without reaching a slot (e.g. on top of an overflowing pile). */
  onMiss?: (chip: ChipKindConfig<CV>, details: SettleDetails) => void;
  /** The board is full and locked. Fires once. */
  onFull?: (details: { reason: FullReason }) => void;
}

export interface DropOptions {
  /** Kind to drop; picks it up first if needed. Defaults to the held or last-used kind. */
  chip?: string;
  /** Where to drop, 0..1. Defaults to the current aim. */
  x?: number;
  /** Replay a drop exactly (see SettleDetails.seed). */
  seed?: number;
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
  /** Freezes the simulation and rendering. */
  pause(): void;
  resume(): void;
  /** Removes everything the board added: DOM, listeners, observers, the frame loop. */
  destroy(): void;
  /** The wrapper element appended inside the target. */
  readonly element: HTMLElement;
}

import type { AddChips, RefillPolicy, SetCount, SupplySnapshot } from '../core/supply';
import type { ChipKindConfig, CoreOptions, SlotConfig } from '../core/types';
import type { KeyBindings } from './input/keyboard';
import type { Labels } from './labels';
import type { Styles } from './styles';
import type { Theme } from './theme';

// Callbacks take one object each, so new fields never break existing hosts.

/** Passed to callbacks about a chip kind: `onPickUp`, `onExhausted`, `onRequest`. */
export interface ChipDetails<CV = unknown> {
  /** The chip kind, exactly as you passed it in `chips`. */
  chip: ChipKindConfig<CV>;
}

/** Passed to `onDrop`: a chip is falling. */
export interface DropDetails<CV = unknown> extends ChipDetails<CV> {
  /** Correlates onDrop, onPegHit, onLand / onMiss, and the drop() promise. */
  dropId: number;
  /** 0..1 across the top of the board. */
  dropX: number;
}

/** Passed to `onPegHit`: a falling chip hit a peg. */
export interface PegHitDetails<CV = unknown> extends DropDetails<CV> {
  /** Which peg, counted row by row from the top, left to right. */
  pegIndex: number;
  /** Impact speed, board units per second. Handy for scaling a sound. */
  speed: number;
}

/** Passed to `onMiss`: a chip came to rest without reaching a slot. */
export interface MissDetails<CV = unknown> extends DropDetails<CV> {
  /** How many pegs the chip hit on the way down. */
  pegHits: number;
  /** Simulated fall time. */
  durationMs: number;
  /** Replays this exact drop when passed to drop({ seed }) with nothing else in flight. */
  seed: number;
}

/** Passed to `onLand`: a chip came to rest in a slot. */
export interface LandDetails<CV = unknown, SV = unknown> extends MissDetails<CV> {
  /** The slot it landed in, exactly as you passed it in `slots`. */
  slot: SlotConfig<SV>;
}

/**
 * Why the board locked: every slot filled, the pile reached the drop line, or every chip is
 * spent with no way to get more.
 */
export type FullReason = 'slots' | 'overflow' | 'exhausted';

/** Passed to `onFull`: the board locked for good. */
export interface FullDetails {
  /** Why it locked. */
  reason: FullReason;
}

/** The host's answer to a request for more chips. 'grant' refills the kind up to its cap. */
export type RequestAnswer = 'grant' | 'deny';

/** The `supply` option. Starting counts come from each chip kind's `count`. */
export interface SupplyOptions {
  /** How spent chips come back. Default { mode: 'never' }. */
  refill?: RefillPolicy;
}

/** What drop() resolves with: only that the chip is no longer in flight. */
export interface Settled {
  /** Matches the `dropId` in that drop's callbacks. */
  dropId: number;
}

/**
 * Everything `createPlinko()` accepts. Only `slots` and `chips` are required. `CV` and `SV` are
 * the types of your chip and slot `value`s; they flow through to every callback.
 *
 * Most options can change later with `board.update()`. The ones that can't are listed in
 * {@link MountOnlyOption}.
 */
export interface PlinkoOptions<CV = unknown, SV = unknown> extends CoreOptions<CV, SV> {
  /** Chips allowed in flight at once. Default Infinity. */
  maxInFlight?: number;
  /**
   * After a keyboard or handle drop, pick up another chip of the same kind at the same spot.
   * Default true. A pointer drop never reloads: the finger has lifted.
   */
  autoReload?: boolean;
  /** Arrow-key step, as a fraction of the drop width, in (0, 1]. Default ¼ slot. */
  aimStep?: number;
  /** Shift+arrow step, as a fraction of the drop width, in (0, 1]. Default 1 slot. */
  aimStepLarge?: number;
  /** Up/down arrow step, as a fraction of the carry from tray to drop line, in (0, 1]. Default one peg row. */
  liftStep?: number;
  /** Shift+up/down step, as a fraction of the carry, in (0, 1]. Default four peg rows. */
  liftStepLarge?: number;
  /** Keyboard bindings to override. Unlisted actions keep {@link DEFAULT_KEYS}. */
  keys?: Partial<KeyBindings>;
  /**
   * Colours to override. Unlisted colours come from `--plinko-*` CSS custom properties, then
   * {@link DEFAULT_THEME}.
   */
  theme?: Partial<Theme>;
  /**
   * Looks for particular slots and chip kinds, keyed by id, plus fonts for every canvas text.
   * Anything left out comes from {@link PlinkoOptions.theme}. Can change on a live board with
   * {@link PlinkoBoard.update}. Ids that aren't on the board throw a PlinkoConfigError.
   */
  styles?: Styles;
  /** Text to override, for wording or translation. Unlisted labels keep {@link DEFAULT_LABELS}. */
  labels?: Partial<Labels>;
  /** "Powered by LittleJS" link under the board. Default true. */
  attribution?: boolean;
  /** Chip counts come from each chip kind's `count` (default Infinity). */
  supply?: SupplyOptions;

  /** A chip was picked up from the tray. */
  onPickUp?: (details: ChipDetails<CV>) => void;
  /** A chip was dropped from the drop zone and is falling. */
  onDrop?: (details: DropDetails<CV>) => void;
  /** A falling chip hit a peg. Fires often; keep it cheap. */
  onPegHit?: (details: PegHitDetails<CV>) => void;
  /** The chip came to rest in a slot. The only signal that a preference should change. */
  onLand?: (details: LandDetails<CV, SV>) => void;
  /** The chip settled without reaching a slot (e.g. on top of an overflowing pile). */
  onMiss?: (details: MissDetails<CV>) => void;
  /** The board is full and locked. Fires once. */
  onFull?: (details: FullDetails) => void;
  /** Chip counts changed. Save this and pass it back as `count` to keep supply across loads. */
  onSupplyChange?: (snapshot: SupplySnapshot) => void;
  /** The last chip of a kind was used up (dropped, or lost off the board). */
  onExhausted?: (details: ChipDetails<CV>) => void;
  /**
   * With refill mode 'onRequest': someone asked for more chips of an empty kind. Answer
   * 'grant' or 'deny', now or later (a promise). Without this callback, requests are granted.
   */
  onRequest?: (details: ChipDetails<CV>) => RequestAnswer | Promise<RequestAnswer>;
}

/**
 * Options fixed when the board is created. They shape the world itself (or its DOM), so
 * board.update() rejects them: destroy the board and create a new one instead.
 */
export type MountOnlyOption = 'slots' | 'chips' | 'board' | 'physics' | 'supply' | 'attribution';

/** What board.update() accepts: every option except the mount-only ones. */
export type BoardUpdate<CV = unknown, SV = unknown> = Partial<
  Omit<PlinkoOptions<CV, SV>, MountOnlyOption>
>;

/** Input to `board.drop()`. Everything is optional. */
export interface DropOptions {
  /** Kind to drop; picks it up first if needed. Defaults to the held or last-used kind. */
  chip?: string;
  /** Where to drop, 0..1. Defaults to the current aim. */
  x?: number;
  /** Replay a drop exactly (see MissDetails.seed / LandDetails.seed). */
  seed?: number;
}

/** Input to `board.supply.request()`. */
export interface SupplyRequest {
  /** The chip kind's id. */
  chip: string;
}

/** The host's view of the chip supply. Changes fire onSupplyChange. */
export interface SupplyController {
  /** Chips left per kind, right now. */
  get(): SupplySnapshot;
  /** Sets a count outright, ignoring the refill cap. */
  set(update: SetCount): void;
  /** Adds (or with a negative amount, removes) chips, ignoring the refill cap. */
  add(update: AddChips): void;
  /** Asks for more chips of an empty kind, as the tray's "request more" does. */
  request(request: SupplyRequest): Promise<RequestAnswer>;
}

/**
 * The handle `createPlinko()` returns. Use it to play the board from code, manage the chip
 * supply, change options, and clean up.
 */
export interface PlinkoBoard<CV = unknown, SV = unknown> {
  /** Picks up a chip of this kind. False if the kind is unknown, none are left, or the board is locked. */
  pickUp(chipId: string): boolean;
  /** Moves the held chip, 0..1. */
  aim(x: number): void;
  /** Drops a chip. Rejects if nothing can be dropped (locked, too many in flight, unknown kind). */
  drop(options?: DropOptions): Promise<Settled>;
  /** Puts the held chip back in the tray. */
  cancel(): void;
  /** Read and change chip counts. */
  readonly supply: SupplyController;
  /** Freezes the simulation and rendering. */
  pause(): void;
  /** Undoes `pause()`. */
  resume(): void;
  /**
   * Changes options on the live board: callbacks, labels, theme, keys, step sizes, autoReload,
   * maxInFlight. Options left out keep their values; an option set to undefined goes back to its
   * default. Throws PlinkoConfigError for mount-only options or invalid values, changing nothing.
   */
  update(options: BoardUpdate<CV, SV>): void;
  /** Removes everything the board added: DOM, listeners, observers, timers, the frame loop. */
  destroy(): void;
  /** The wrapper element appended inside the target. */
  readonly element: HTMLElement;
}

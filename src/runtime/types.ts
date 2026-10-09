import type { AddChips, RefillPolicy, SetCount, SupplySnapshot } from '../core/supply';
import type { ChipKindConfig, CoreOptions, SlotConfig } from '../core/types';
import type { KeyBindings } from './input/keyboard';
import type { Labels } from './labels';
import type { Styles } from './styles';
import type { Theme } from './theme';
import type { SlotLabelOptions } from './view/slot-labels';

// Callbacks take one object each, so new fields never break existing hosts.

/** Passed to callbacks about a chip kind: `onPickUp`, `onExhausted`, `onRequest`. */
export interface ChipDetails<CV = unknown> {
  /** The chip kind, exactly as you passed it in `chips`. */
  chip: ChipKindConfig<CV>;
}

/** Passed to `onDrop`: a chip is falling. */
export interface DropDetails<CV = unknown> extends ChipDetails<CV> {
  /**
   * Identifies this drop. The same number comes with the drop's `onPegHit`, `onLand` or `onMiss`
   * calls, and in what {@link PlinkoBoard.drop} resolves with.
   */
  dropId: number;
  /** Where the chip was dropped: 0 is the leftmost drop position, 1 the rightmost. */
  dropX: number;
}

/** Passed to `onPegHit`: a falling chip hit a peg. */
export interface PegHitDetails<CV = unknown> extends DropDetails<CV> {
  /** Which peg, counted row by row from the top, left to right. */
  pegIndex: number;
  /** Impact speed, in board units per second. Handy for scaling a sound's volume. */
  speed: number;
}

/** Passed to `onMiss`: a chip came to rest without reaching a slot. */
export interface MissDetails<CV = unknown> extends DropDetails<CV> {
  /** How many pegs the chip hit on the way down. */
  pegHits: number;
  /** How long the fall took, in milliseconds of simulated time (pauses don't count). */
  durationMs: number;
  /**
   * Replays this exact drop: pass it to {@link PlinkoBoard.drop} as `{ seed }` while no other
   * chip is falling, and the chip takes the same path.
   */
  seed: number;
}

/** Passed to `onLand`: a chip came to rest in a slot. */
export interface LandDetails<CV = unknown, SV = unknown> extends MissDetails<CV> {
  /** The slot it landed in, exactly as you passed it in `slots`. */
  slot: SlotConfig<SV>;
}

/**
 * Why the board locked:
 * - `'slots'`: every slot is full.
 * - `'overflow'`: a pile reached the drop line.
 * - `'exhausted'`: every chip is spent and the refill policy can't bring any back.
 */
export type FullReason = 'slots' | 'overflow' | 'exhausted';

/** Passed to `onFull`: the board locked for good. */
export interface FullDetails {
  /** Why it locked. */
  reason: FullReason;
}

/**
 * Your answer to a request for more chips (see {@link PlinkoOptions.onRequest}). `'grant'` refills
 * the kind to its starting count; `'deny'` leaves it empty.
 *
 * In TypeScript, `async () => 'grant'` is inferred as returning `Promise<string>` and won't
 * compile. Annotate the return type, or return the answer without `async`.
 *
 * @example
 * ```ts
 * onRequest: async ({ chip }): Promise<RequestAnswer> =>
 *   (await askServer(chip.id)) ? 'grant' : 'deny',
 * ```
 */
export type RequestAnswer = 'grant' | 'deny';

/** The `supply` option. Starting counts come from each chip kind's `count`. */
export interface SupplyOptions {
  /**
   * Whether and how spent chips come back.
   *
   * @defaultValue `{ mode: 'never' }`
   */
  refill?: RefillPolicy;
}

/**
 * What {@link PlinkoBoard.drop} resolves with, once the chip has stopped: it landed, missed, or
 * the board was destroyed. Where it ended up comes through `onLand` or `onMiss`.
 */
export interface Settled {
  /** Matches the `dropId` in that drop's callbacks. */
  dropId: number;
}

/**
 * How much the board moves:
 * - `'auto'`: follows the visitor's `prefers-reduced-motion` setting, and reacts when it changes.
 * - `'reduced'`: dropped chips appear where they come to rest, without the fall; pegs don't
 *   flash; lost chips fade out instead of falling.
 * - `'full'`: always animates.
 */
export type MotionPreference = 'auto' | 'full' | 'reduced';

/**
 * Everything `createPlinko()` accepts. Only `slots` and `chips` are required. `CV` and `SV` are
 * the types of your chip and slot `value`s; they flow through to every callback.
 *
 * Most options can change later with `board.update()`. The ones that can't are listed in
 * {@link MountOnlyOption}.
 */
export interface PlinkoOptions<CV = unknown, SV = unknown> extends CoreOptions<CV, SV> {
  /**
   * How much the board moves; see {@link MotionPreference}.
   *
   * @defaultValue `'auto'`
   */
  motion?: MotionPreference;
  /**
   * How many chips can fall at once. Drops beyond that are refused, and announced as "busy",
   * until one comes to rest.
   *
   * @defaultValue `Infinity`
   */
  maxInFlight?: number;
  /**
   * After a drop by keyboard or by `board.drop()`, pick up another chip of the same kind at the
   * same spot, ready to drop again. Pointer drops never reload: the finger or mouse has let go.
   *
   * @defaultValue `true`
   */
  autoReload?: boolean;
  /**
   * How far the left and right arrow keys move a chip, as a fraction of the range it can be dropped
   * across, in (0, 1].
   *
   * @defaultValue a quarter of a slot's width
   */
  aimStep?: number;
  /**
   * How far Shift+left/right moves a chip, as a fraction of the range it can be dropped across, in
   * (0, 1].
   *
   * @defaultValue one slot's width
   */
  aimStepLarge?: number;
  /**
   * How far the up and down arrow keys move a chip between the tray and the drop line, as a
   * fraction of that distance, in (0, 1]. The distance depends on the slot label layout.
   *
   * @defaultValue one peg row
   */
  liftStep?: number;
  /**
   * How far Shift+up/down moves a chip between the tray and the drop line, as a fraction of that
   * distance, in (0, 1].
   *
   * @defaultValue four peg rows
   */
  liftStepLarge?: number;
  /** Keyboard bindings to change. Actions you leave out keep {@link DEFAULT_KEYS}. */
  keys?: Partial<KeyBindings>;
  /**
   * Colors to change. Colors you leave out come from `--plinko-*` CSS custom properties if the
   * page sets them, otherwise from {@link DEFAULT_THEME}.
   */
  theme?: Partial<Theme>;
  /**
   * Looks for particular slots and chip kinds (fills, outlines, label text; keyed by id), and the
   * font for all of the board's text.
   * Anything left out comes from {@link PlinkoOptions.theme}. An id that isn't on the board throws
   * a {@link PlinkoConfigError}.
   */
  styles?: Styles;
  /**
   * Where slot labels go (under the slots, on their back walls, slanted, …). Changing it on a live
   * board refits the board, since some layouts need more room.
   */
  slotLabels?: SlotLabelOptions;
  /**
   * Text to change, for wording or translation. Labels you leave out keep
   * {@link DEFAULT_LABELS}.
   */
  labels?: Partial<Labels>;
  /**
   * Shows a "Powered by LittleJS" link under the board.
   *
   * @defaultValue `true`
   */
  attribution?: boolean;
  /**
   * Whether spent chips come back, and how. Starting counts come from each chip kind's `count`;
   * see the chip supply guide.
   */
  supply?: SupplyOptions;

  /** A chip was picked up from the tray. */
  onPickUp?: (details: ChipDetails<CV>) => void;
  /** A chip was dropped and is falling. */
  onDrop?: (details: DropDetails<CV>) => void;
  /** A falling chip hit a peg. This fires often, so keep it cheap. */
  onPegHit?: (details: PegHitDetails<CV>) => void;
  /** A chip came to rest in a slot. This is the outcome to act on. */
  onLand?: (details: LandDetails<CV, SV>) => void;
  /** A chip came to rest without reaching a slot, for example on top of a full pile. */
  onMiss?: (details: MissDetails<CV>) => void;
  /** The board is full and has locked. Fires once. */
  onFull?: (details: FullDetails) => void;
  /**
   * Chip counts changed. To keep counts across page loads, save the snapshot and pass each
   * count back as the chip kind's `count`.
   */
  onSupplyChange?: (snapshot: SupplySnapshot) => void;
  /** The last chip of a kind was used up: dropped, or lost off the board. */
  onExhausted?: (details: ChipDetails<CV>) => void;
  /**
   * With refill mode `'onRequest'`: the player asked for more chips of an empty kind. Return
   * `'grant'` or `'deny'`, or a promise of one to decide later (for example after asking a
   * server). Without this callback, every request is granted. See {@link RequestAnswer} for a
   * TypeScript catch with `async`.
   */
  onRequest?: (details: ChipDetails<CV>) => RequestAnswer | Promise<RequestAnswer>;
}

/**
 * Options fixed when the board is created. They shape the board itself, so `board.update()`
 * rejects them; to change one, destroy the board and create a new one.
 */
export type MountOnlyOption = 'slots' | 'chips' | 'board' | 'physics' | 'supply' | 'attribution';

/** What `board.update()` accepts: every option except the mount-only ones. */
export type BoardUpdate<CV = unknown, SV = unknown> = Partial<
  Omit<PlinkoOptions<CV, SV>, MountOnlyOption>
>;

/** Input to {@link PlinkoBoard.drop}. Everything is optional. */
export interface DropOptions {
  /**
   * Id of the chip kind to drop. Defaults to the chip being held, else the last kind used, else
   * the kind selected in the tray.
   */
  chip?: string;
  /** Where to drop, from 0 (leftmost) to 1 (rightmost). Defaults to where the chip is aimed. */
  x?: number;
  /** Replays an earlier drop exactly; see {@link MissDetails.seed}. */
  seed?: number;
}

/** Input to `board.supply.request()`. */
export interface SupplyRequest {
  /** The chip kind's id. */
  chip: string;
}

/** Reads and changes chip counts from code. Every change fires `onSupplyChange`. */
export interface SupplyController {
  /** Chips left per kind, right now. */
  get(): SupplySnapshot;
  /**
   * Sets a kind's count outright. Unlike a refill, it can go above the kind's starting count.
   */
  set(update: SetCount): void;
  /**
   * Adds chips to a kind, or removes them with a negative amount (stopping at 0). Unlike a
   * refill, it can go above the kind's starting count.
   */
  add(update: AddChips): void;
  /** Asks for more chips of an empty kind, as the tray's "request more" button does. */
  request(request: SupplyRequest): Promise<RequestAnswer>;
}

/**
 * The handle `createPlinko()` returns. Use it to play the board from code, manage the chip
 * supply, change options, and clean up.
 */
export interface PlinkoBoard<CV = unknown, SV = unknown> {
  /**
   * Picks up a chip of this kind, as if the player took one from the tray. Returns false if the
   * kind is unknown, none are left, or the board is locked.
   */
  pickUp(chipId: string): boolean;
  /** Moves the held chip sideways: 0 is the leftmost drop position, 1 the rightmost. */
  aim(x: number): void;
  /**
   * Drops a chip, picking one up first if needed. The promise resolves once the chip has stopped.
   * It rejects with an `Error` if nothing can be dropped: the kind is unknown or empty, too many
   * chips are falling, or the board is locked.
   */
  drop(options?: DropOptions): Promise<Settled>;
  /** Puts the held chip back in the tray. */
  cancel(): void;
  /** Reads and changes chip counts. */
  readonly supply: SupplyController;
  /** Freezes the simulation and rendering until `resume()`. */
  pause(): void;
  /** Undoes `pause()`. */
  resume(): void;
  /**
   * Changes options on the live board: any option except the {@link MountOnlyOption}s. Options
   * you leave out keep their values; an option set to `undefined` goes back to its default. Throws
   * a {@link PlinkoConfigError} for mount-only options or invalid values, and then changes nothing.
   */
  update(options: BoardUpdate<CV, SV>): void;
  /**
   * Removes everything the board added: its elements, event listeners, observers, timers and
   * animation loop. Pending `drop()` promises resolve.
   */
  destroy(): void;
  /** The wrapper element the board appended inside your target element. */
  readonly element: HTMLElement;
}

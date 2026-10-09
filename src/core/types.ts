// Distances are in board units: 1 unit = horizontal peg spacing = slot width.
// The y axis points down, like the canvas.

/**
 * A slot at the bottom of the board: one outcome a chip can land in. `SV` is the type of `value`.
 */
export interface SlotConfig<SV = unknown> {
  /** Unique among slots. Identifies the slot in `physics.bias` and `styles.slots`. */
  id: string;
  /** Drawn on the board (where depends on `slotLabels`) and read out in announcements. */
  label: string;
  /** What landing here means for your app. Passed back to `onLand`. */
  value?: SV;
  /** Anything else you want to carry along. The board never reads it; `onLand` hands it back. */
  data?: unknown;
}

/**
 * A kind of chip the player can drop, such as "On" or "Off". `CV` is the type of `value`.
 */
export interface ChipKindConfig<CV = unknown> {
  /**
   * Unique among chip kinds. Identifies the kind in `styles.chips`, `board.supply` and
   * `board.drop()`.
   */
  id: string;
  /** Shown in the tray and read out in announcements. */
  label: string;
  /** What this chip means for your app. Passed back to callbacks. */
  value?: CV;
  /**
   * Chips of this kind the player starts with: a whole number ≥ 0, or `Infinity`.
   *
   * @defaultValue `Infinity`
   */
  count?: number;
}

/**
 * The board's shape. Distances are in board units: 1 unit is the horizontal gap between pegs,
 * which is also the width of a slot.
 */
export interface BoardConfig {
  /**
   * Rows of pegs, from 1 to 40.
   *
   * @defaultValue `8`
   */
  rows?: number;
  /**
   * Radius of each peg. Chips must fit between pegs: `2 × chipRadius < 1 − 2 × pegRadius`.
   *
   * @defaultValue `0.08`
   */
  pegRadius?: number;
  /**
   * Radius of each chip, at most 0.45. Chips must fit between pegs (see `pegRadius`).
   *
   * @defaultValue `0.3`
   */
  chipRadius?: number;
  /**
   * Height of the slots, i.e. of the rails between them.
   *
   * @defaultValue `2.5`
   */
  slotHeight?: number;
  /**
   * Thickness of the rails between slots. Their tops are rounded. Less than 0.5.
   *
   * @defaultValue `0.08`
   */
  railWidth?: number;
}

/** How chips move. Speeds and distances are in board units (see {@link BoardConfig}). */
export interface PhysicsConfig {
  /**
   * Units per second squared.
   *
   * @defaultValue `45`
   */
  gravity?: number;
  /**
   * Bounciness, 0..1. At about 0.15 or less, chips can settle into a lane and run straight down.
   *
   * @defaultValue `0.3`
   */
  restitution?: number;
  /**
   * How much a hit slows a chip sliding along a peg, 0..1. At about 0.3 or more, chips can come to
   * rest on top of a peg.
   *
   * @defaultValue `0.1`
   */
  friction?: number;
  /**
   * The largest random sideways kick a peg hit adds, in units per second. Raise it for more
   * unpredictable paths.
   *
   * @defaultValue `0.5`
   */
  jitter?: number;
  /**
   * Top speed, in units per second. Keep it modest: it also stops fast chips from passing
   * through pegs.
   *
   * @defaultValue `14`
   */
  maxSpeed?: number;
  /**
   * Whether chips bounce off each other. When false, they pass through each other.
   *
   * @defaultValue `true`
   */
  chipCollisions?: boolean;
  /**
   * An integer that fixes the board's randomness, for repeatable runs (tests, demos). Each drop
   * gets its own seed derived from it, reported in `onLand` and `onMiss`. Random when omitted.
   */
  seed?: number;
  /**
   * Nudges chips toward or away from slots: slot id → weight, a number ≥ 0. Above 1 pulls chips
   * toward that slot, below 1 pushes them away, and 1 (the default for unlisted slots) does
   * neither. The pull starts halfway down the board.
   */
  bias?: Record<string, number>;
}

export interface CoreOptions<CV = unknown, SV = unknown> {
  /** The slots chips can land in, left to right: 1 to 50, with unique ids. Set at mount. */
  slots: SlotConfig<SV>[];
  /** The chip kinds in the tray, left to right: 1 to 20, with unique ids. Set at mount. */
  chips: ChipKindConfig<CV>[];
  /** The board's shape. Set at mount; `board.update()` can't change it. */
  board?: BoardConfig;
  /** How chips move. Set at mount; `board.update()` can't change it. */
  physics?: PhysicsConfig;
}

export type ResolvedBoard = Required<BoardConfig>;

export interface ResolvedPhysics extends Required<Omit<PhysicsConfig, 'bias'>> {
  /** Per slot index; 1 means no bias. */
  bias: number[];
}

export interface ResolvedCoreOptions<CV = unknown, SV = unknown> {
  slots: SlotConfig<SV>[];
  chips: ChipKindConfig<CV>[];
  board: ResolvedBoard;
  physics: ResolvedPhysics;
}

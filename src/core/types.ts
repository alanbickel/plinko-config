// Distances are in board units: 1 unit = horizontal peg spacing = slot width.
// The y axis points down, like the canvas.

export interface SlotConfig<SV = unknown> {
  id: string;
  label: string;
  value?: SV;
  color?: string;
  data?: unknown;
}

export interface ChipKindConfig<CV = unknown> {
  id: string;
  label: string;
  value?: CV;
  color?: string;
  count?: number;
}

export interface BoardConfig {
  /** Rows of pegs. */
  rows?: number;
  pegRadius?: number;
  chipRadius?: number;
  /** Height of the slots, i.e. of the rails between them. */
  slotHeight?: number;
  /** Thickness of the rails between slots. Their tops are rounded. */
  railWidth?: number;
}

export interface PhysicsConfig {
  /** Units per second squared. */
  gravity?: number;
  /** Bounciness, 0..1. */
  restitution?: number;
  /** Coulomb friction coefficient, 0..1: tangential speed lost is at most this × the impact. */
  friction?: number;
  /** Max random sideways kick per peg hit, units per second. The "chaos" knob. */
  jitter?: number;
  /** Speed cap, units per second. Also what keeps chips from tunnelling through pegs. */
  maxSpeed?: number;
  /** Chips bounce off each other. */
  chipCollisions?: boolean;
  /** Base seed. Each drop derives its own stream from this. Random when omitted. */
  seed?: number;
  /** Slot id → weight. Above 1 pulls chips toward that slot, below 1 pushes them away. */
  bias?: Record<string, number>;
}

export interface CoreOptions<CV = unknown, SV = unknown> {
  slots: SlotConfig<SV>[];
  chips: ChipKindConfig<CV>[];
  board?: BoardConfig;
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

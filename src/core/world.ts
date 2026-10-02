import { dropXToBoard, type Layout, slotIndexAt } from './layout';
import { createRng, hashSeed, type Rng } from './rng';
import type { ResolvedPhysics } from './types';
import { collideCircleBox, collideCircleCircle, type Vector2, vec2 } from './vendor/littlejs/math';

/** Fixed simulation step, seconds. Seeded drops reproduce because this never changes. */
export const STEP = 1 / 120;

/**
 * A chip that stays within this distance of where it started being still counts as still.
 * Measured by displacement, not speed, so a chip jittering in a jam (contacts shoving it back
 * and forth every step) still counts as still.
 */
const STILL_RADIUS = 0.03;
/** Still this long in a slot, or on top of the pile → settled. */
const REST_STEPS = 24;
/**
 * Still this long anywhere else → stuck, gets nudged. Layout keeps physics jam-free, so this is
 * only a safety net; deliberately stuck chips are a planned prank, not a physics side effect.
 */
const STUCK_STEPS = 90;
/** A chip still stuck after this many nudges settles as a miss (e.g. piles jammed into pegs). */
const MAX_NUDGES = 3;
/** Failsafe: any chip still flying after this many steps settles as a miss. */
const MAX_AGE_STEPS = 60 / STEP;
/** Impacts slower than this (units/s) are contact, not hits: no event, no jitter. */
const HIT_SPEED = 1;
/** Sideways push while resting on a peg, rail cap, wall bump, or piled chip, units/s². */
const ROLL_OFF_ACCEL = 6;
/** Peak horizontal pull of a bias weight, units/s². */
const BIAS_STRENGTH = 6;

export type ChipOutcome = 'landed' | 'missed';

export interface ChipBody {
  readonly id: number;
  readonly kindId: string;
  /** Drop position in [0, 1]. */
  readonly dropX: number;
  readonly seed: number;
  readonly rng: Rng;
  pos: Vector2;
  /** Position before the latest step, so renderers can interpolate between steps. */
  prevPos: Vector2;
  vel: Vector2;
  pegHits: number;
  ageSteps: number;
  /** Steps spent within STILL_RADIUS of stillFrom. */
  stillSteps: number;
  stillFrom: Vector2;
  nudges: number;
  /** Resting on a landed chip this step. */
  onPile: boolean;
  /** Set once settled. */
  outcome?: ChipOutcome;
  /** Set only for a valid landing. */
  slotIndex?: number;
}

/** Why the board can't take any more changes. */
export type FullReason = 'slots' | 'overflow';

export interface PegHitEvent {
  type: 'pegHit';
  chip: ChipBody;
  pegIndex: number;
  speed: number;
}

/** At rest with some part below the rail tops: a real slot result. */
export interface LandedEvent {
  type: 'landed';
  chip: ChipBody;
  slotIndex: number;
}

/** Settled anywhere else (on a pile above the rails, out of nudges, or the failsafe). */
export interface MissedEvent {
  type: 'missed';
  chip: ChipBody;
}

/** Emitted once: every slot's pile reached the rail tops, or a chip settled at the drop line. */
export interface FullEvent {
  type: 'full';
  reason: FullReason;
}

/** Every world event, keyed by its type. */
export interface WorldEventByType {
  pegHit: PegHitEvent;
  landed: LandedEvent;
  missed: MissedEvent;
  full: FullEvent;
}

export type WorldEvent = WorldEventByType[keyof WorldEventByType];

export interface WorldInput {
  layout: Layout;
  physics: ResolvedPhysics;
  /** Keep landed chips as static colliders (piles). Off only for distribution tests. */
  keepLanded?: boolean;
}

export interface SpawnInput {
  kindId: string;
  /** Drop position in [0, 1] across the top. */
  x: number;
  /** Replays a drop exactly. Defaults to one derived from the session seed and drop id. */
  seed?: number;
}

type StaticKind = 'peg' | 'rail' | 'wall' | 'chip';

interface StaticCircle {
  x: number;
  y: number;
  r: number;
  kind: StaticKind;
  index: number;
}

interface Kick {
  chip: ChipBody;
  circle: StaticCircle;
  impact: number;
}

interface Settlement {
  chip: ChipBody;
  inSlot: boolean;
}

/**
 * The physics simulation. Pure: no DOM, no timers. Call step() once per STEP of game time.
 * Settled chips (landed or missed) freeze in place and become part of the board, so piles grow
 * forever.
 */
export class World {
  readonly layout: Layout;
  readonly physics: ResolvedPhysics;
  readonly flying: ChipBody[] = [];
  readonly landed: ChipBody[] = [];
  /** Set once the board is full. The runtime locks the board; the world itself keeps working. */
  full?: FullReason;
  private readonly slotFull: boolean[];
  private readonly keepLanded: boolean;
  private readonly biasStartY: number;
  private readonly grid = new CircleGrid();
  private nextId = 0;
  /** Events of the step in progress. */
  private events: WorldEvent[] = [];

  constructor({ layout, physics, keepLanded = true }: WorldInput) {
    this.layout = layout;
    this.physics = physics;
    this.keepLanded = keepLanded;
    this.slotFull = new Array<boolean>(layout.slotCount).fill(false);
    this.biasStartY = midpoint(layout.pegRows);
    this.insertStatics();
  }

  spawn({ kindId, x, seed }: SpawnInput): ChipBody {
    const id = this.nextId++;
    const chipSeed = seed ?? hashSeed(this.physics.seed, id);
    const pos = vec2(dropXToBoard(this.layout, x), this.layout.spawnY);
    const chip: ChipBody = {
      id,
      kindId,
      dropX: x,
      seed: chipSeed,
      rng: createRng(chipSeed),
      pos,
      prevPos: pos,
      vel: vec2(0, 0),
      pegHits: 0,
      ageSteps: 0,
      stillSteps: 0,
      stillFrom: pos,
      nudges: 0,
      onPile: false,
    };
    this.flying.push(chip);
    return chip;
  }

  /** Advances the simulation by one STEP and returns what happened. */
  step(): WorldEvent[] {
    this.events = [];
    for (const chip of this.flying) chip.prevPos = chip.pos;
    for (const chip of this.flying) this.integrate(chip);
    for (const chip of this.flying) this.collideStatic(chip);
    if (this.physics.chipCollisions) this.collideChips();
    for (const chip of [...this.flying]) this.updateRest(chip);
    return this.events;
  }

  private insertStatics(): void {
    const { pegs, railCaps, wallBumps } = this.layout;
    for (const [index, c] of pegs.entries()) this.grid.insert({ ...c, kind: 'peg', index });
    for (const [index, c] of railCaps.entries()) this.grid.insert({ ...c, kind: 'rail', index });
    for (const [index, c] of wallBumps.entries()) this.grid.insert({ ...c, kind: 'wall', index });
  }

  private integrate(chip: ChipBody): void {
    const { gravity, maxSpeed } = this.physics;
    const ax = chip.pos.y > this.biasStartY ? this.biasAccel(chip.pos.x) : 0;
    chip.vel = vec2(chip.vel.x + ax * STEP, chip.vel.y + gravity * STEP).clampLength(maxSpeed);
    chip.pos = chip.pos.add(chip.vel.scale(STEP));
    chip.ageSteps++;
  }

  private biasAccel(x: number): number {
    let ax = 0;
    this.physics.bias.forEach((weight, i) => {
      if (weight === 1) return;
      const dx = i + 0.5 - x;
      ax += ((weight - 1) * BIAS_STRENGTH * Math.sign(dx)) / (1 + dx * dx);
    });
    return ax;
  }

  private collideStatic(chip: ChipBody): void {
    chip.onPile = false;
    for (const circle of this.grid.near(chip.pos)) this.touchCircle(chip, circle);
    for (const b of this.layout.boxes) {
      const push = collideCircleBox(
        chip.pos,
        this.layout.chipRadius,
        vec2(b.x, b.y),
        vec2(b.w, b.h),
      );
      if (push) this.resolve(chip, push);
    }
  }

  private touchCircle(chip: ChipBody, circle: StaticCircle): void {
    const push = collideCircleCircle(
      chip.pos,
      this.layout.chipRadius,
      vec2(circle.x, circle.y),
      circle.r,
    );
    if (!push) return;
    if (circle.kind === 'chip' && push.y < 0) chip.onPile = true; // pushed up: resting on top
    const impact = this.resolve(chip, push);
    if (impact <= HIT_SPEED) {
      this.rollOff(chip, circle);
      return;
    }
    if (circle.kind !== 'chip') this.kick({ chip, circle, impact });
  }

  /** A real hit on a static: random sideways kick, and a peg-hit event for pegs. */
  private kick({ chip, circle, impact }: Kick): void {
    chip.vel = vec2(chip.vel.x + chip.rng.range(-1, 1) * this.physics.jitter, chip.vel.y);
    if (circle.kind !== 'peg') return;
    chip.pegHits++;
    this.events.push({ type: 'pegHit', chip, pegIndex: circle.index, speed: impact });
  }

  /**
   * Resting on something round (peg, cap, bump, piled chip) is an unstable balance; speed up
   * rolling off it. Overflowing piles spill into neighbouring slots this way.
   */
  private rollOff(chip: ChipBody, circle: StaticCircle): void {
    const dx = chip.pos.x - circle.x;
    const dir = dx !== 0 ? Math.sign(dx) : chip.rng.sign();
    chip.vel = vec2(chip.vel.x + dir * ROLL_OFF_ACCEL * STEP, chip.vel.y);
  }

  /** Moves the chip out of a contact and bounces it. Returns the impact speed. */
  private resolve(chip: ChipBody, push: Vector2): number {
    chip.pos = chip.pos.add(push);
    const n = push.normalize();
    const vn = chip.vel.dot(n);
    if (vn >= 0) return 0;
    const { restitution, friction } = this.physics;
    const normal = n.scale(-vn * restitution);
    // Coulomb friction: tangential loss is capped by the normal impulse, so hard bounces scrub
    // speed while resting contact (tiny impulse each step) lets chips roll off pegs.
    const tangent = chip.vel.subtract(n.scale(vn));
    const tSpeed = tangent.length();
    const loss = Math.min(tSpeed, friction * (1 + restitution) * -vn);
    chip.vel = normal.add(tSpeed > 0 ? tangent.scale(1 - loss / tSpeed) : tangent);
    return -vn;
  }

  private collideChips(): void {
    const chips = this.flying;
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        this.collidePair(chips[i] as ChipBody, chips[j] as ChipBody);
      }
    }
  }

  /** Equal-mass circle collision between two flying chips. */
  private collidePair(a: ChipBody, b: ChipBody): void {
    const r = this.layout.chipRadius;
    const push = collideCircleCircle(a.pos, r, b.pos, r);
    if (!push) return;
    a.pos = a.pos.add(push.scale(0.5));
    b.pos = b.pos.subtract(push.scale(0.5));
    const n = push.normalize();
    const rv = a.vel.subtract(b.vel).dot(n);
    if (rv >= 0) return;
    const impulse = n.scale((-(1 + this.physics.restitution) * rv) / 2);
    a.vel = a.vel.add(impulse);
    b.vel = b.vel.subtract(impulse);
  }

  private updateRest(chip: ChipBody): void {
    trackStillness(chip);
    const inSlot = chip.pos.y + this.layout.chipRadius > this.layout.railTopY;

    // Still anywhere else (on a peg, a rail cap, a wall) is a jam and falls through to a nudge.
    if ((inSlot || chip.onPile) && chip.stillSteps >= REST_STEPS) {
      this.settle({ chip, inSlot });
      return;
    }
    if (givesUp(chip)) {
      this.settle({ chip, inSlot: false });
      return;
    }
    if (chip.stillSteps >= STUCK_STEPS) nudge(chip);
  }

  /** Freezes a chip into the pile and reports a landing (inSlot) or a miss. */
  private settle({ chip, inSlot }: Settlement): void {
    chip.vel = vec2(0, 0);
    chip.prevPos = chip.pos;
    this.flying.splice(this.flying.indexOf(chip), 1);
    this.events.push(inSlot ? this.land(chip) : miss(chip));
    if (!this.keepLanded) return;
    this.landed.push(chip);
    const { x, y } = chip.pos;
    this.grid.insert({ x, y, r: this.layout.chipRadius, kind: 'chip', index: chip.id });
    this.updateFull(chip);
  }

  private land(chip: ChipBody): LandedEvent {
    const slotIndex = slotIndexAt(this.layout, chip.pos.x);
    chip.outcome = 'landed';
    chip.slotIndex = slotIndex;
    return { type: 'landed', chip, slotIndex };
  }

  private updateFull(chip: ChipBody): void {
    if (this.full) return;
    const top = chip.pos.y - this.layout.chipRadius;
    if (top <= this.layout.railTopY) this.slotFull[slotIndexAt(this.layout, chip.pos.x)] = true;
    const reason = this.fullReason(top);
    if (!reason) return;
    this.full = reason;
    this.events.push({ type: 'full', reason });
  }

  /** Why the board is full now that a chip settled with its top edge at `top`, if it is. */
  private fullReason(top: number): FullReason | undefined {
    if (top <= this.layout.spawnY) return 'overflow';
    return this.slotFull.every(Boolean) ? 'slots' : undefined;
  }
}

function midpoint(values: readonly number[]): number {
  return ((values[0] ?? 0) + (values[values.length - 1] ?? 0)) / 2;
}

/** Counts steps spent near one spot; moving away restarts the count from the new spot. */
function trackStillness(chip: ChipBody): void {
  const moved = chip.pos.distanceSquared(chip.stillFrom) > STILL_RADIUS ** 2;
  chip.stillFrom = moved ? chip.pos : chip.stillFrom;
  chip.stillSteps = moved ? 0 : chip.stillSteps + 1;
}

/** Stuck after every nudge, or flying far too long. */
function givesUp(chip: ChipBody): boolean {
  const outOfNudges = chip.stillSteps >= STUCK_STEPS && chip.nudges >= MAX_NUDGES;
  return outOfNudges || chip.ageSteps >= MAX_AGE_STEPS;
}

function nudge(chip: ChipBody): void {
  chip.nudges++;
  chip.stillSteps = 0;
  chip.vel = vec2(chip.rng.sign() * 2, -1);
}

function miss(chip: ChipBody): MissedEvent {
  chip.outcome = 'missed';
  return { type: 'missed', chip };
}

/** Neighbouring cells, in the order the grid has always been searched (it affects contact order). */
type CellOffset = readonly [number, number];

const NEIGHBOURS: readonly CellOffset[] = [-1, 0, 1].flatMap((dx) =>
  [-1, 0, 1].map((dy) => [dx, dy] as const),
);

/**
 * Uniform grid of static circles with 1-unit cells. Every static radius plus the chip radius is at
 * most 1 unit, so the 3×3 cells around a point hold everything that can touch a chip there.
 */
class CircleGrid {
  private readonly cells = new Map<number, StaticCircle[]>();

  insert(circle: StaticCircle): void {
    const key = cellKey(Math.floor(circle.x), Math.floor(circle.y));
    const cell = this.cells.get(key);
    if (!cell) {
      this.cells.set(key, [circle]);
      return;
    }
    cell.push(circle);
  }

  *near(pos: Vector2): Generator<StaticCircle> {
    const cx = Math.floor(pos.x);
    const cy = Math.floor(pos.y);
    for (const [dx, dy] of NEIGHBOURS) {
      const cell = this.cells.get(cellKey(cx + dx, cy + dy));
      if (cell) yield* cell;
    }
  }
}

const cellKey = (cx: number, cy: number) => (cx + 512) * 4096 + (cy + 512);

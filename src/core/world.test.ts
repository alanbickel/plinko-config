import { describe, expect, it } from 'vitest';
import { buildLayout } from './layout';
import { resolveCoreOptions } from './options';
import type { BoardConfig, PhysicsConfig } from './types';
import {
  type ChipBody,
  type LandedEvent,
  type MissedEvent,
  STEP,
  World,
  type WorldEvent,
} from './world';

interface MakeWorldInput {
  slots?: number;
  board?: BoardConfig;
  physics?: PhysicsConfig;
  keepLanded?: boolean;
}

interface SettledDrop {
  chip: ChipBody;
  events: WorldEvent[];
}

function makeWorld(opts: MakeWorldInput = {}): World {
  const slotCount = opts.slots ?? 7;
  const o = resolveCoreOptions({
    slots: Array.from({ length: slotCount }, (_, i) => ({ id: `s${i}`, label: `Slot ${i}` })),
    chips: [{ id: 'chip', label: 'Chip' }],
    board: opts.board,
    physics: { seed: 1, ...opts.physics },
  });
  return new World({
    layout: buildLayout(slotCount, o.board),
    physics: o.physics,
    keepLanded: opts.keepLanded,
  });
}

/** Runs the world until this chip settles. */
function runUntilSettled(world: World, chip: ChipBody): SettledDrop {
  const events: WorldEvent[] = [];
  while (world.flying.includes(chip)) events.push(...world.step());
  return { chip, events };
}

/** Drops one chip and runs until it settles. */
function dropOne(world: World, x: number): SettledDrop {
  return runUntilSettled(world, world.spawn({ kindId: 'chip', x }));
}

/** Deterministic drop positions in [0, 1]. */
function* positions(n: number, seed = 99): Generator<number> {
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    yield s / 2 ** 32;
  }
}

function histogram(world: World, xs: Iterable<number>): number[] {
  const counts = new Array<number>(world.layout.slotCount).fill(0);
  for (const x of xs) {
    const { chip } = dropOne(world, x);
    const i = chip.slotIndex;
    if (i !== undefined) counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}

interface FlightStats {
  /** Steps the chip spent outside the board's walls or below its floor. */
  outside: number;
  /** Closest any step brought the chip's centre to a peg's centre. */
  closest: number;
}

/** Drops a chip and watches every step of its fall. */
function flightStats(world: World, x: number): FlightStats {
  const { layout } = world;
  const chip = world.spawn({ kindId: 'chip', x });
  const stats: FlightStats = { outside: 0, closest: Number.POSITIVE_INFINITY };
  while (world.flying.includes(chip)) {
    world.step();
    const { x: cx, y: cy } = chip.pos;
    if (cx <= 0 || cx >= layout.width || cy >= layout.floorY) stats.outside++;
    for (const p of layout.pegs)
      stats.closest = Math.min(stats.closest, Math.hypot(cx - p.x, cy - p.y));
  }
  return stats;
}

/** Holds the drop key at one spot: a chip every 0.1 s, 80 chips. Returns each chip's fall time. */
function runBurst(world: World, x: number): number[] {
  const ages: number[] = [];
  let spawned = 0;
  for (let step = 0; (spawned < 80 || world.flying.length > 0) && step < 120 / STEP; step++) {
    if (spawned < 80 && step % 12 === 0) {
      world.spawn({ kindId: 'chip', x });
      spawned++;
    }
    ages.push(
      ...world
        .step()
        .filter(isSettled)
        .map((e) => e.chip.ageSteps * STEP),
    );
  }
  return ages;
}

const isLanded = (e: WorldEvent): e is LandedEvent => e.type === 'landed';
const isMissed = (e: WorldEvent): e is MissedEvent => e.type === 'missed';
const isSettled = (e: WorldEvent): e is LandedEvent | MissedEvent => isLanded(e) || isMissed(e);

describe('World: single drops', () => {
  it('replays a seeded drop exactly', () => {
    const replay = (world: World) =>
      runUntilSettled(world, world.spawn({ kindId: 'chip', x: 0.37, seed: 1234 }));
    const a = replay(makeWorld());
    const b = replay(makeWorld({ physics: { seed: 999 } }));
    expect(b.chip.slotIndex).toBe(a.chip.slotIndex);
    expect(b.chip.ageSteps).toBe(a.chip.ageSteps);
    expect(b.chip.pos).toEqual(a.chip.pos);
  });

  it('derives the same per-drop seeds from the same session seed', () => {
    const run = () => {
      const world = makeWorld({ physics: { seed: 5 } });
      return [...positions(20)].map((x) => dropOne(world, x).chip.slotIndex);
    };
    expect(run()).toEqual(run());
  });

  it('lands every chip in a slot, without nudges, within a few seconds', () => {
    const world = makeWorld({ keepLanded: false });
    for (const x of [0, 1, 0.5, ...positions(300)]) {
      const { chip, events } = dropOne(world, x);
      expect(chip.outcome).toBe('landed');
      expect(chip.nudges).toBe(0);
      expect(chip.ageSteps * STEP).toBeLessThan(6);
      expect(events.filter((e) => e.type === 'landed')).toHaveLength(1);
      expect(chip.pos.y + world.layout.chipRadius).toBeGreaterThan(world.layout.railTopY);
    }
  });

  it('emits peg hits', () => {
    const { chip, events } = dropOne(makeWorld(), 0.5);
    const hits = events.filter((e) => e.type === 'pegHit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBe(chip.pegHits);
  });

  it('never tunnels through a peg or leaves the board, even at extreme settings', () => {
    // Speed pinned at maxSpeed by huge gravity, lively bounces, lots of jitter.
    const world = makeWorld({
      keepLanded: false,
      physics: { gravity: 400, maxSpeed: 14, restitution: 0.6, jitter: 2 },
    });
    const { layout } = world;
    const flights = [...positions(40)].map((x) => flightStats(world, x));
    expect(flights.map((f) => f.outside)).toEqual(new Array(40).fill(0));
    // Contacts resolve each step, so overlap stays a small fraction of the radii.
    const closest = Math.min(...flights.map((f) => f.closest));
    expect(closest).toBeGreaterThan(layout.chipRadius + layout.pegRadius - 0.1);
  });
});

describe('World: distribution', () => {
  it('spreads centre drops in a bell shape', () => {
    const world = makeWorld({ keepLanded: false });
    const counts = histogram(world, new Array(2000).fill(0.5));
    const share = counts.map((n) => n / 2000);
    const [s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, s6 = 0] = share;
    expect(s3).toBe(Math.max(...share));
    expect(s2).toBeGreaterThan(s1);
    expect(s4).toBeGreaterThan(s5);
    expect(s0 + s6).toBeLessThan(0.1);
  });

  it('bias pulls chips toward a weighted slot', () => {
    const xs = [...positions(1500)];
    const plain = histogram(makeWorld({ keepLanded: false }), xs);
    const biased = histogram(makeWorld({ keepLanded: false, physics: { bias: { s1: 4 } } }), xs);
    expect(biased[1] ?? 0).toBeGreaterThan((plain[1] ?? 0) * 1.3);
  });
});

describe('World: piles and full board', () => {
  it('fills a slot, then overflows into its neighbours', () => {
    // One row of boundary pegs: centre drops fall straight into the middle slot until it's full.
    const world = makeWorld({ slots: 5, board: { rows: 1 } });
    const results: ChipBody[] = [];
    for (let i = 0; i < 20; i++) results.push(dropOne(world, 0.5).chip);
    const first = results.slice(0, 3).map((c) => c.slotIndex);
    expect(first).toEqual([2, 2, 2]);
    const landedElsewhere = results.filter((c) => c.outcome === 'landed' && c.slotIndex !== 2);
    expect(landedElsewhere.length).toBeGreaterThan(0);
  });

  it('reports misses (not landings) once chips settle above the rails', () => {
    const world = makeWorld();
    const events: WorldEvent[] = [];
    for (const x of positions(120)) events.push(...dropOne(world, x).events);

    const { chipRadius, railTopY } = world.layout;
    const bottom = (e: LandedEvent | MissedEvent) => e.chip.pos.y + chipRadius;
    const missed = events.filter(isMissed);
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.filter((e) => e.chip.slotIndex !== undefined)).toEqual([]);
    expect(missed.filter((e) => bottom(e) > railTopY)).toEqual([]);
    expect(events.filter(isLanded).filter((e) => bottom(e) <= railTopY)).toEqual([]);
  });

  it('emits full exactly once, when every slot has filled', () => {
    const world = makeWorld();
    const events: WorldEvent[] = [];
    let landedBeforeFull = new Set<number>();
    for (const x of positions(120)) {
      const { events: e } = dropOne(world, x);
      events.push(...e);
      if (!world.full) {
        landedBeforeFull = new Set(world.landed.map((c) => c.slotIndex ?? -1));
      }
    }
    const full = events.filter((e) => e.type === 'full');
    expect(full).toEqual([{ type: 'full', reason: 'slots' }]);
    expect(world.full).toBe('slots');
    expect(landedBeforeFull.size).toBeGreaterThan(1);
  });

  it('reports overflow when a chip settles at the drop line before every slot fills', () => {
    // Many narrow-ish slots and a single drop point: the centre tower reaches the top
    // long before the far slots fill.
    const world = makeWorld({ slots: 30, board: { rows: 1 } });
    for (let i = 0; i < 2000 && !world.full; i++) dropOne(world, 0.5);
    expect(world.full).toBe('overflow');
  });

  it('settles every chip even when dropping far past full', () => {
    const world = makeWorld();
    for (const x of positions(200)) {
      const { chip } = dropOne(world, x);
      expect(chip.outcome).toBeDefined();
    }
    expect(world.flying).toHaveLength(0);
  });
});

describe('World: rapid fire', () => {
  // Regression: holding Enter at one spot stacks in-flight chips into the pegs. Stillness used to
  // be judged by speed, so jittering chips never settled and ran to the 60 s failsafe.
  it.each([
    [5, 0.484],
    [5, 0.1],
    [7, 0.5],
  ])('settles a held-down burst promptly (%i slots, x=%f)', (slots, x) => {
    const world = makeWorld({ slots });
    const ages = runBurst(world, x);
    expect(ages).toHaveLength(80);
    expect(Math.max(...ages)).toBeLessThan(8);
    expect(world.full).toBe('slots');
  });

  it('handles 100 chips in flight at once', () => {
    const world = makeWorld();
    for (const x of positions(100)) world.spawn({ kindId: 'chip', x });
    const started = performance.now();
    let steps = 0;
    while (world.flying.length > 0 && steps < 60 / STEP) {
      world.step();
      steps++;
    }
    const msPerStep = (performance.now() - started) / steps;
    expect(world.flying).toHaveLength(0);
    // A 60 Hz frame runs two steps; leave plenty of room for slow CI machines.
    expect(msPerStep).toBeLessThan(2);
  });
});

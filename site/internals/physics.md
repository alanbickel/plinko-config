---
description: The board's geometry, how chips move and collide, and how the world decides a chip has come to rest.
---

# Physics

The physics world (`src/core/world.ts`) moves falling chips, collides them with the board and each other, and decides when each one has come to rest and where. It's pure TypeScript: no DOM, no timers, and no `Math.random`. The [frame loop](./frame-loop) calls `world.step()` once per 1/120 s of game time and passes on the events it returns.

Collision math (circle against circle, circle against box, and vectors) is vendored from [LittleJS](https://github.com/KilledByAPixel/LittleJS) in `src/core/vendor/littlejs/`, unchanged from upstream.

## Board units

All distances are in board units: one unit is the horizontal spacing between pegs, which is also the width of a slot. The y axis points down, as on the canvas. The world never deals in pixels; the canvas view scales board units to the screen.

## Geometry

`buildLayout()` (`src/core/layout.ts`) turns the slot count and the `board` option into pegs, walls, rails, and a floor.

- **Pegs** sit in rows of an equilateral triangle lattice. Rows alternate between pegs over slot centres and pegs over slot boundaries. The last row sits over the boundaries, directly above the rails.
- **No traps.** A peg too close to a wall for a chip to pass would trap chips, so it becomes a half-round bump set into the wall instead. The bumps also stop chips from sliding straight down the walls.
- **Rails** divide the slots. Each has a rounded cap, so chips roll off it instead of balancing on top.
- **The drop line** is above the first peg row. Chips spawn there.

## A step

Each step does the same five things, in order, for the chips in flight:

1. **Move.** Apply gravity, plus any `bias` pull below the middle of the peg field, and cap the speed at `maxSpeed`. The cap also stops chips passing through pegs.
2. **Collide with the board.** Push the chip out of any peg, cap, bump, settled chip, wall, rail, or floor it overlaps, and bounce it (`restitution`, `friction`). A real hit on a peg, cap, or bump adds a random sideways kick of up to `jitter`; a hit on a peg also counts toward `pegHits` and emits a `pegHit` event.
3. **Roll off round things.** A chip resting on a peg, cap, bump, or settled chip, rather than hitting it, gets a small push away from its centre. Resting on something round is an unstable balance, and this is also how chips spill off an overflowing pile into the next slot.
4. **Collide chips with each other**, if `chipCollisions` is on, as equal-mass circles.
5. **Check for rest**, below.

Static circles (pegs, caps, bumps, and settled chips) are kept in a grid of 1-unit cells, so each chip is only tested against the circles in the 3×3 cells around it.

## Coming to rest

A chip counts as still once it stays within a small radius of one spot, however much it jitters. Speed alone isn't enough: in rapid fire, chips in a heap shove each other every step without going anywhere.

| Still for | Where | Result |
|---|---|---|
| 24 steps (0.2 s) | Any part below the rail tops | **Landed**, in the slot under its centre |
| 24 steps | On top of a settled chip, above the rails | **Missed** |
| 90 steps (0.75 s) | Anywhere else, such as balanced on a peg | **Nudged**: a small kick up and to one side |
| 90 steps, after 3 nudges | Anywhere | **Missed** |
| 60 s in flight | Anywhere | **Missed** |

The layout leaves no place a chip can get stuck, so the nudge is only a safety net.

A chip that lands or misses freezes where it is and becomes a static circle that later chips collide with. That's how piles build up.

## A full board

When a chip settles with its top at or above the rail tops, its slot is marked full. The world emits `full` once: with `overflow` if that chip's top reaches the drop line, or with `slots` once every slot is full. The world keeps working after that; it's the runtime that locks the board.

## Seeds

Each chip gets its own random number generator (mulberry32) from a seed. By default, the seed mixes `physics.seed` with the chip's id, and `physics.seed` itself is random unless you set it. `drop({ seed })` passes a seed directly.

The step is fixed and nothing else is random, so a seed and a drop position always produce the same fall, as long as no other chip is in flight to bump into it.

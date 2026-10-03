---
description: The architectural rules the codebase follows, and what enforces each one.
---

# Rules

These rules keep the board predictable for hosts and the code easy to change. Coding standards (function length, parameters, control flow) are in [CONTRIBUTING.md](https://github.com/alanbickel/plinko-config/blob/main/CONTRIBUTING.md#coding-standards).

## 1. Core never imports runtime

`src/core/` is pure TypeScript: no DOM and no timers. The physics, layout, options, and supply logic can be tested and simulated without a browser (`npm run sim` runs the world headless). The one call to `Math.random` in core picks the base seed at mount when `physics.seed` isn't set.

**Enforced by:** a Biome `noRestrictedImports` rule on `src/core/**`. Core tests run in Node with no DOM.

## 2. Only the command state machine changes the held chip

Picking up, carrying, dropping, putting back, and losing a chip all go through `CommandMachine` (`src/runtime/commands.ts`). Keyboard, pointer, and handle calls produce the same commands, so they behave the same way, and supply reservations always match what's held.

**Enforced by:** convention. Input modules turn events into actions and apply them through one path (`src/runtime/input/perform.ts`); they don't touch state.

## 3. Views only read state

The canvas, the DOM nodes, and the announcer draw or speak what the state says. They never change it.

**Enforced by:** convention. The canvas view receives a `FrameState` snapshot each frame.

## 4. Host callbacks run outside the physics step, and can't break the board

World events are queued during stepping and dispatched after (see [Frame loop](./frame-loop#events-after-stepping)). Every host callback goes through `callHost()` (`src/runtime/context.ts`), which catches and logs anything it throws.

**Enforced by:** a unit test that a throwing callback leaves the board working (`src/runtime/board.test.ts`).

## 5. No global side effects

No listeners on `window` or `document`, no stylesheet added to the page, and nothing runs at import time except registering `<plinko-board>` in `plinko-config/element`.

**Enforced by:** `sideEffects` in `package.json` lists only the element entry, and a test imports that entry in plain Node and checks it registers nothing (`src/element.test.ts`). The rest is convention.

## 6. `destroy()` removes everything

It stops the frame loop, removes listeners and observers, stops the refill timer, releases the held chip's reservation, settles pending `drop()` promises, and removes the wrapper. Calling it twice is safe.

**Enforced by:** unit tests for destroying the board, the state machine, the pointer listeners, the reduced-motion listener, and the custom element.

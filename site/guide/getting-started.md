---
description: Install plinko-config, mount a board, and react when a chip lands.
---

# Getting started

## Install

```sh
npm install plinko-config
```

The package is ESM-only, ships its own types, and has no runtime dependencies.

## Mount a board

Give `createPlinko` a target element (or a selector) and two lists: the **slots** a chip can land in, and the **chips** a player can drop. When a chip comes to rest in a slot, `onLand` fires. That's the signal to change the preference.

<<< ../examples/getting-started.ts#mount

Players pick up a chip, aim it, and drop it with the keyboard, or drag it with a mouse or finger.

## Clean up

`createPlinko` returns a handle. Call `destroy()` to remove everything the board added: DOM, listeners, observers, timers, and the frame loop.

<<< ../examples/getting-started.ts#destroy

## Next

- [Chip supply](./chip-supply): limit how many chips a player gets, and how they come back.
- [API reference](../api/): every option, callback, and handle method.

---
description: What the board owns, what your app owns, and what the board touches on the page.
---

# Ownership

## Your app owns the state

The board doesn't store anything: no local storage, no cookies, no network requests. It reports what happens through callbacks and takes its starting state from options.

| Your app gets | From |
|---|---|
| Where a chip landed | `onLand` |
| Chip counts, whenever they change | `onSupplyChange` |
| That the board locked | `onFull` |

| Your app gives | Through |
|---|---|
| Starting chip counts | Each chip's `count` |
| Whether a request for more chips is granted | `onRequest` |

Applying a preference when a chip lands, and saving chip counts between visits, are up to your app. See [Chip supply](../guide/chip-supply#keeping-counts-across-page-loads) for saving counts.

## The board stays in its wrapper

`createPlinko()` appends one wrapper element inside the target and builds everything else inside it: the canvas, the screen-reader text, and the attribution link. Styles are set inline on those elements; no stylesheet is added to the page.

The board listens for events on its own canvas only, never on `window` or `document`. The one other listener follows the visitor's reduced-motion setting, on its media query.

The board does reach outside the wrapper in two ways:

- It reads the target's size, and its computed padding, to fit the board. See [Sizing](./sizing).
- When a visitor picks up a chip by pointer and part of the board is off screen, it scrolls the board into view.

`destroy()` removes the wrapper and everything the board set up. See [Board lifecycle](../lifecycle/board#destroy).

## Importing has no side effects

Importing `plinko-config` does nothing until you call `createPlinko()`. Importing `plinko-config/element` registers the `<plinko-board>` element, and that is the package's only side effect. Without a DOM, during server rendering for example, importing it does nothing.

The package has no runtime or peer dependencies.

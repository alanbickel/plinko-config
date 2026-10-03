---
description: How the board measures the screen and its target, and when it refits.
---

# Sizing internals

The behaviour is described in [Sizing](../contracts/sizing). This page covers how it's measured. The code is in `src/runtime/sizing.ts` and `src/runtime/observe.ts`.

## Fitting

`fitToHost()` picks the largest width that satisfies three limits, then sets the canvas height from the board's aspect ratio:

- the wrapper's width,
- the target's own height, if it has one, times the aspect ratio,
- the screen's height, times the aspect ratio.

From both heights it first subtracts the wrapper's other content, such as the attribution link, since that content sits under the canvas.

## Measuring the screen

The board doesn't listen on `window`, so it can't use `resize` events or read `innerHeight` reactively. Instead, the wrapper holds a hidden ruler: an empty element `100svh` tall. `svh` is the screen height with mobile browser toolbars shown, so the board doesn't resize as the toolbars hide and show. The ruler sits inside a zero-size box with `overflow: hidden`, so it never adds to the page's scroll height.

## Telling a fixed-height target apart

A target that grows with its content would report the canvas's own height, and fitting to that would keep the board at whatever size it already is. To tell the two apart, `fitToHost()` sets the canvas height to zero for a moment and reads the target's height. Whatever height the target keeps is its own. A height of 1 px or less counts as no limit.

## Refitting

A `ResizeObserver` watches the wrapper, the target, and the ruler. The refit runs on the next animation frame, not inside the observer's callback. When the target's height follows the canvas, refitting inside the callback resizes an element the observer is watching, and the browser reports that as an error on the page.

`update()` refits directly when the theme, styles, or slot labels change, since the slot label plan sets the depth of the label strip, and the strip is part of the board's shape.

Environments without `ResizeObserver` or `IntersectionObserver` skip refitting and pausing, and the board stays at its first size.

---
description: How the board measures the screen and its target, and when it refits.
---

# Sizing internals

The behavior is described in [Sizing](../contracts/sizing). This page covers how it's measured. The code is in `src/runtime/sizing.ts`, `src/runtime/observe.ts`, and `src/runtime/view/slot-labels.ts`.

## Fitting

`fitToHost()` reads the root font size, then picks the largest width that satisfies three limits:

- the wrapper's width,
- the target's own height, if it has one,
- the screen's height.

From both heights it first subtracts the wrapper's other content, such as the attribution link, since that content sits under the canvas.

The canvas's height isn't proportional to its width: the board scales with the width, but the label strip is sized in rem and doesn't. So `fitWidth()` doesn't use an aspect ratio. If the full width is too tall, it halves the range of widths 24 times, asking the view for the height at each width (`heightAt()`), and keeps the widest that fits. Height grows with width, except where `horizontalWhenFit` switches layout at some width; there it finds a width that fits, not always the widest.

The root font size is measured at every fit, from a hidden ruler 1rem wide (see below). Page zoom changes the screen's size in CSS pixels, so it refits on its own.

## Planning slot labels

`planSlotLabels()` (in `src/runtime/view/slot-labels.ts`) is a pure function of the canvas width and the root font size. It works in CSS pixels, then converts the plan to board units for drawing. Each label's width is measured once at size 1, when the labels or their fonts change, and scaled from there: text width is proportional to font size.

- **Board width.** The board gets the canvas width minus the room angled labels need past the walls (mirrored on the left, so the board stays centered): `unit = (cssWidth − 2 × extra) ÷ (slots + 2 × side)`. The room needed shrinks as the unit grows, since the last label starts inside its slot, so this is solved in closed form.
- **Strip cap.** Vertical and angled strips stop at half the board's height from the drop line to the floor.
- **Apart.** Neighbouring labels need 1.1 text sizes between them: the slot width for vertical and backboard labels, slot width × sin 40° for angled ones.
- **Shrink, then cut.** Labels that don't fit the cap, or don't stay apart, shrink toward the floor; at the floor they're cut. Smaller text means a shorter strip and a wider board, so the largest size (or run) that fits is found by halving, 40 times. When even floor-size text can't stay apart, labels stay at the floor and overlap.

Drawing uses the plan's size and floor, so labels are never drawn larger than planned. `fitText()` treats text within a billionth of its room as fitting, since text sized to fit exactly can measure a hair over from rounding.

## The tray and the banner

`trayLayout()` (in `src/runtime/view/geometry.ts`) keeps the tray's chips in board units, since they're part of the board, and stacks a caption line (0.875rem) and a note line (0.75rem) under them, each 1.1 text sizes tall. So the tray grows with the root font size. The note line is kept even when no kind has a note, so a note appearing doesn't change the board's shape.

`bannerLayout()` sizes the full-board message at 1.125rem, on a band at least 2.5 text sizes tall. The banner lies over the board, so it doesn't change its shape.

## Measuring the screen

The board doesn't listen on `window`, so it can't use `resize` events or read `innerHeight` reactively. Instead, the wrapper holds a hidden ruler: an empty element `100svh` tall. `svh` is the screen height with mobile browser toolbars shown, so the board doesn't resize as the toolbars hide and show. The ruler sits inside a zero-size box with `overflow: hidden`, so it never adds to the page's scroll height.

The same box holds a second ruler, `1rem` wide. Its width is the root font size in CSS pixels, and when the visitor changes the browser's text size, it changes width, which the board's `ResizeObserver` sees. Without it, a font size change would go unnoticed until something else resized, since the board doesn't listen on `window`.

## Telling a fixed-height target apart

A target that grows with its content would report the canvas's own height, and fitting to that would keep the board at whatever size it already is. To tell the two apart, `fitToHost()` sets the canvas height to zero for a moment and reads the target's height. Whatever height the target keeps is its own. A height of 1 px or less counts as no limit.

## Refitting

A `ResizeObserver` watches the wrapper, the target, and both rulers. The refit runs on the next animation frame, not inside the observer's callback. When the target's height follows the canvas, refitting inside the callback resizes an element the observer is watching, and the browser reports that as an error on the page.

`update()` refits directly when the theme, styles, or slot labels change, since the slot label plan sets the depth of the label strip, and the strip is part of the board's shape.

Environments without `ResizeObserver` or `IntersectionObserver` skip refitting and pausing, and the board stays at its first size.

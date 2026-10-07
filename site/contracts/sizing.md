---
description: How the board sizes itself to its target and the screen, and how slot labels affect its shape.
---

# Sizing

The board fills the target's width, but it's never taller than the screen. If the target has a height of its own, the board fits inside that too, centred. The board keeps its shape: its width and height always change together.

## The screen limit

The whole board, tray included, always fits on screen. A visitor dragging a chip by touch can't scroll the page (the canvas sets `touch-action: none`), so any part of the board below the screen's edge would be out of reach.

The screen's height is measured with the mobile browser's toolbars shown. The board doesn't change size as the toolbars hide and show while the page scrolls.

## Targets with a height

A target whose height doesn't depend on its content, such as one with a fixed `height` or a flex or grid item that's stretched, limits the board's height too. The board takes the target's padding into account. A target that's only as tall as its content doesn't limit the board.

## When it refits

The board refits when the target, the wrapper, or the screen changes size. It also refits after `update()` changes the theme, the per-slot or per-chip styles, or the slot label layout, since those can change the board's shape.

## Slot labels and shape

The slot labels sit in a strip under the slots, or on the slots' back walls. Their layout is set by `slotLabels.layout`:

| Layout | Labels |
|---|---|
| `'vertical'` (default) | Under each slot, reading top to bottom |
| `'horizontal'` | On one line under each slot |
| `'angled'` | Under each slot, slanting down to the right |
| `'backboard'` | On each slot's back wall, behind the chips |

With `horizontalWhenFit` (on by default), `'vertical'` and `'angled'` labels are shown horizontally instead whenever every label fits its slot at the normal size.

The label strip is part of the board. A layout with a deeper strip makes the board taller for the same width, which on a short screen means narrower. Changing the layout, the label font, or the root font size changes the board's shape.

## Text size

Slot labels are sized in rem, so they follow the visitor's font size setting and page zoom: 0.875rem normally, and never smaller than 0.75rem. Tray captions and the message shown when the board is full are sized with the board, and also never smaller than 0.75rem.

## Labels and narrow slots

`'vertical'` and `'angled'` labels get a strip deep enough for the longest label, up to half the board's height (from the drop line to the floor). When the labels don't fit at 0.875rem, they shrink toward 0.75rem, then are cut with "…". `'horizontal'` labels shrink, then are cut, when they're wider than their slot, and `'backboard'` labels when they're longer than the slot's back wall.

Neighbouring labels are kept apart. On narrow slots, labels shrink toward 0.75rem, and `'angled'` labels are also shortened, which leaves the board more width. When a slot is too narrow for even 0.75rem text, neighbouring labels overlap. Landing announcements still name the slot.

How narrow slots get depends on the board's shape and the screen. A board with many slots runs out of width. A board with many rows runs out of height first, and on a short screen it gets narrow whatever the number of slots. The board accepts up to 50 slots and doesn't check the table below.

The most slots whose labels stay apart, measured with labels like "Email Marketing" and "Dark Mode", with `horizontalWhenFit` off. Each cell gives `'horizontal'` / `'vertical'` / `'backboard'` / `'angled'`; "–" means even 2 slots overlap. "200% font size" is a root font size of 32px.

| Screen | Text | 3 rows | 8 rows | 16 rows |
|---|---|---|---|---|
| Phone 320×568 | 100% | 18 / 25 / 25 / 13 | 18 / 25 / 25 / 13 | 18 / 25 / 25 / 13 |
| Phone 320×568 | 200% font size | 7 / 14 / 14 / 5 | 7 / 14 / 14 / – | – / 4 / 14 / – |
| Phone 320×568 | 200% zoom | 7 / 15 / 15 / 5 | 7 / 15 / 15 / – | – / – / 15 / – |
| Pixel 7 (412×839) | 100% | 24 / 25 / 25 / 18 | 24 / 25 / 25 / 18 | 24 / 25 / 25 / 18 |
| Pixel 7 (412×839) | 200% font size | 10 / 19 / 19 / 7 | 10 / 19 / 19 / 7 | 10 / 14 / 19 / – |
| Pixel 7 (412×839) | 200% zoom | 11 / 20 / 20 / 7 | 11 / 20 / 20 / 7 | 11 / 14 / 20 / – |
| Desktop 1280×800 | 100% | 25 / 25 / 25 / 25 | 25 / 25 / 25 / 25 | 25 / 25 / 25 / 25 |
| Desktop 1280×800 | 200% font size | 25 / 25 / 25 / 25 | 25 / 25 / 25 / 25 | 25 / 25 / 25 / – |
| Desktop 1280×800 | 200% zoom | 25 / 25 / 25 / 25 | 25 / 25 / 25 / 25 | 25 / 25 / 25 / – |
| Desktop 1280×520 | 100% | 25 / 25 / 25 / 25 | 25 / 25 / 25 / 25 | 25 / 25 / 25 / 25 |
| Desktop 1280×520 | 200% font size | 25 / 25 / 25 / 25 | 25 / 25 / 25 / – | – / – / 25 / – |
| Desktop 1280×520 | 200% zoom | 25 / 25 / 25 / 25 | – / 25 / 25 / – | – / – / 25 / – |

25 is the most measured, not a limit.

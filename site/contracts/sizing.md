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

The label strip is part of the board. A layout with a deeper strip makes the board taller for the same width, which on a short screen means narrower. Changing the layout or the label font changes the board's shape.

Canvas text, including slot labels and the tray's captions, is never drawn smaller than 12 CSS pixels. Text that doesn't fit shrinks toward that size, then is cut off with "…". Canvas text doesn't get larger when the visitor zooms the page.

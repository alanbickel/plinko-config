---
description: Keyboard controls, screen-reader announcements, focus, reduced motion, and touch behaviour.
---

# Accessibility

The whole game can be played with a keyboard, and every important moment is announced to screen readers. All the text is yours to change through the `labels` option.

## Focus

The board is a single tab stop: the canvas. It has `role="application"`, a `game` role description, a name from `labels.board`, and a description from `labels.instructions` that's read once when it gets focus.

The board never handles Tab or keys pressed with Ctrl, Alt, or Meta, so focus can always move on. The focus ring is drawn on the canvas in the theme's `focus` colour. It's hidden after a mouse or touch interaction and comes back on the next key press.

## Keyboard

With no chip held:

| Key | Action |
|---|---|
| ← / → | Choose a chip kind in the tray |
| Enter or Space | Pick up the chosen kind (on an empty kind that can be requested, ask for more) |

While holding a chip:

| Key | Action |
|---|---|
| ↑ / ↓ | Carry it toward the drop zone at the top, or back toward the tray |
| ← / → | Move it across the board |
| Shift + arrow | Take bigger steps |
| Home / End | Jump to the left or right edge |
| Enter or Space | Drop it |
| Escape | Put it back in the tray |

↓ never drops a chip. Dropping outside the drop zone loses the chip, by design. That one's a prank, and it's announced.

Step sizes come from `aimStep`, `aimStepLarge`, `liftStep`, and `liftStepLarge`. Rebind any action with the `keys` option. The defaults are in [`DEFAULT_KEYS`](../api/plinko-config/variables/DEFAULT_KEYS).

## Announcements

Announcements go to a polite `aria-live` region. They cover:

- choosing a kind, with how many are left ("On chip, 3 left.")
- picking up, putting back, and dropping
- carrying a chip into and out of the drop zone
- landing in a slot, missing, and falling off the board
- several chips settling close together, batched into one message
- running out of chips, and how to ask for more
- requests for more chips: pending, granted, or denied
- too many chips in the air
- the board locking when it's full (trying to pick up again repeats the message)

The same message is announced again if it repeats. Every message comes from a template in `labels`, so you can reword or translate any of them. See [`Labels`](../api/plinko-config/interfaces/Labels) and [`DEFAULT_LABELS`](../api/plinko-config/variables/DEFAULT_LABELS).

## Reduced motion

When the user prefers reduced motion:

- pegs don't flash when hit
- lost chips fade out instead of falling
- scrolling the board into view is instant instead of smooth

## Touch

The canvas sets `touch-action: none`, so dragging a chip never scrolls the page. The board, tray included, never grows taller than the screen, and picking up a chip scrolls the whole board into view.

## Colour

The default theme's text and focus colours meet WCAG AA contrast (at least 4.5:1) against its background. If you change colours with `theme` or `styles`, check their contrast too.

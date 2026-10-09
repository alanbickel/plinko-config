---
description: Keyboard controls, screen-reader announcements, focus, reduced motion, and touch behavior.
---

# Accessibility

The whole game can be played with a keyboard, and every important moment is announced to screen readers. The text players see and hear comes from two places: the `label` on each item in `chips` and `slots` (shown in the tray and under the slots, and spoken in announcements), and the board's own wording in the `labels` option.

## Focus

The board is a single tab stop: the canvas. It has `role="application"`, a role description from `labels.roleDescription` (what screen readers call it, `"game"` by default), a name from `labels.board`, and a description from `labels.instructions` that's read once when it gets focus.

The board never handles Tab or keys pressed with Ctrl, Alt, or Meta, so focus can always move on. The focus ring is drawn on the canvas in the theme's `focus` color. It's hidden after a mouse or touch interaction and comes back on the next key press.

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

### Custom keys

The `keys` option maps each action to a list of [`KeyboardEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key) values. Actions you leave out keep their defaults from [`DEFAULT_KEYS`](../api/plinko-config/variables/DEFAULT_KEYS). An action you list gets exactly the keys you give it, so include the defaults you want to keep.

<<< ../examples/accessibility.ts#keys

The actions are `left`, `right`, `up`, `down`, `home`, `end`, `pickUp`, `drop`, and `cancel`. See [`KeyBindings`](../api/plinko-config/interfaces/KeyBindings).

## Announcements

Announcements go to a polite `aria-live` region. They cover:

- choosing a kind, with how many are left ("On chip, 3 left.")
- picking up, putting back, and dropping
- carrying a chip into and out of the drop zone
- the slot under the held chip, once it stops moving over a different slot
- landing in a slot, missing, and falling off the board
- several chips settling close together, batched into one message
- running out of chips, and how to ask for more
- requests for more chips: pending, granted, or denied
- too many chips in the air
- the board locking when it's full (trying to pick up again repeats the message)

The same message is announced again if it repeats.

### Wording

Most messages name a chip or slot, using the `label` you gave it in `chips` or `slots`. The rest of each message comes from `labels`. Plain strings are used as they are. Templates are functions that receive the chip (and, for landings, the slot) and return the message. Override any of them to reword or translate. Labels you leave out keep the English defaults.

<<< ../examples/accessibility.ts#labels

See [`Labels`](../api/plinko-config/interfaces/Labels) for what each template receives, and [`DEFAULT_LABELS`](../api/plinko-config/variables/DEFAULT_LABELS) for the defaults.

## Reduced motion

By default (`motion: 'auto'`), the board follows the visitor's `prefers-reduced-motion` setting, and it switches as soon as that setting changes, with no reload. Set `motion: 'reduced'` or `motion: 'full'` to choose for them, for example from your app's own settings. You can change it later with `board.update()`.

With reduced motion:

- a dropped chip settles at once instead of falling
- pegs don't flash when hit
- lost chips fade out instead of falling
- scrolling the board into view is instant instead of smooth

For background, see [WCAG 2.2: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## Touch

The canvas sets `touch-action: none`, so dragging a chip never scrolls the page. The board, tray included, never grows taller than the screen, and picking up a chip scrolls the whole board into view.

## Color

The default theme's text and focus colors meet WCAG AA contrast (at least 4.5:1) against its background. If you change colors with `theme` or `styles`, check their contrast too.

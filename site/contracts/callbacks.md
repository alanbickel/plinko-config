---
description: When callbacks run, what they receive, and what happens when they throw.
---

# Callbacks

## What they receive

Every callback takes one object. New fields can be added later without breaking your code.

| Callback | When | Receives |
|---|---|---|
| `onPickUp` | A chip is picked up from the tray | `{ chip }` |
| `onDrop` | A chip is dropped from the drop zone | `{ chip, dropId, dropX }` |
| `onPegHit` | A falling chip hits a peg | `{ chip, dropId, dropX, pegIndex, speed }` |
| `onLand` | A chip comes to rest in a slot | `{ chip, slot, dropId, dropX, pegHits, durationMs, seed }` |
| `onMiss` | A chip comes to rest without reaching a slot | `{ chip, dropId, dropX, pegHits, durationMs, seed }` |
| `onFull` | The board locks | `{ reason }` |
| `onSupplyChange` | Chip counts change | `{ counts }` |
| `onExhausted` | The last chip of a kind is used up | `{ chip }` |
| `onRequest` | Someone asks for more chips of an empty kind | `{ chip }`, and returns an answer |

`chip` and `slot` are the objects you passed in `chips` and `slots`, so any `value` you gave them comes back too. `dropId` links one drop's callbacks to each other and to its `drop()` promise. For the full types, see the [API reference](../api/).

For the order the callbacks of one drop fire in, see [Chip lifecycle](../lifecycle/chip#callback-order).

## When they run

Callbacks about falling chips (`onPegHit`, `onLand`, `onMiss`, and `onFull` when the board fills) run once per frame, after the physics has finished stepping. A callback never runs in the middle of a physics step, so it can call back into the board, for example `board.update()` from inside `onLand`.

The board reads each callback from its current options when it fires. After `update()` replaces a callback, the next event goes to the new one.

`onPegHit` can fire many times per second while several chips are falling. Keep it cheap.

## When they throw

A callback that throws doesn't stop the board. The error is logged to the console with `console.error`, and the board carries on as if the callback had returned.

## Requests for more chips

With refill mode `onRequest`, `onRequest` answers `'grant'` or `'deny'`, either directly or with a promise. Anything other than `'grant'` counts as a denial, including a callback that throws or a promise that rejects. Without an `onRequest`, every request is granted.

While a request for a kind is waiting, asking again for the same kind waits for the same answer. If the board is destroyed before the answer comes, the answer is ignored.

## `drop()` promises

`board.drop()` resolves with `{ dropId }` once the chip is no longer in flight. It doesn't say where the chip ended up: `onLand` and `onMiss` are the only source of outcomes. The promise rejects if the drop is refused: the board is locked, too many chips are in flight, or the kind is unknown or has none left.

## `<plinko-board>` events

The custom element fires each callback, except `onRequest`, as a DOM event too: `plinko-pick-up`, `plinko-drop`, `plinko-peg-hit`, `plinko-land`, `plinko-miss`, `plinko-full`, `plinko-supply-change`, and `plinko-exhausted`. The event's `detail` is the object the callback receives. Events bubble and cross shadow DOM boundaries, and each one fires before the callback in `options`, if there is one.

`onRequest` stays a callback, since an event can't return an answer.

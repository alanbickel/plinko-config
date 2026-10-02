// Pointer gestures → actions. Pure: the board hit-tests the point and owns the DOM listeners.
//
// Drag only, for touch and mouse alike. Press a tray chip to pick it up; it follows the pointer.
// Release in the drop zone to drop, over the tray to put it back (so a tap does nothing), and
// anywhere else to lose it off the bottom of the board. Presses anywhere but the tray do nothing.

import type { Hit } from '../view/canvas';
import type { InputAction } from './actions';

/** A press: the actions it starts with, or null when it starts nothing. */
export function press(hit: Hit | null): InputAction[] | null {
  if (hit?.zone !== 'tray') return null;
  return [{ type: 'pickUp', index: hit.index }];
}

/** A move during a press: the chip goes where the pointer is (clamped to the carry path). */
export function move(hit: Hit | null): InputAction[] {
  return hit ? [carryTo(hit)] : [];
}

type Release = 'tray' | 'board' | 'outside';

const RELEASES: Record<Release, (hit: Hit | null) => InputAction[]> = {
  tray: () => [{ type: 'cancel' }],
  // The machine drops from the drop zone and loses the chip anywhere else on the board.
  board: (hit) => [...move(hit), { type: 'drop', reload: false }],
  outside: () => [{ type: 'lose' }],
};

/** The end of a press. Does nothing unless a chip is held (the pickup may have found none). */
export function release(hit: Hit | null, holding: boolean): InputAction[] {
  if (!holding) return [];
  return RELEASES[hit?.zone ?? 'outside'](hit);
}

const carryTo = ({ x, lift }: Hit): InputAction => ({ type: 'carry', x, lift });

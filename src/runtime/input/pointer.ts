// Pointer gestures → actions. Pure: the board hit-tests the point and owns the DOM listeners.
//
// Touch and mouse alike. Drag: press a tray chip to pick it up; it follows the pointer. Release in
// the drop zone to drop, over the tray to put it back, and anywhere else to lose it off the bottom
// of the board. Tap, so no drag is needed: a press that stays on the tray keeps the chip held; the
// next press carries it to the pointer, and its release follows the same rules (a second tap drops
// it, loses it, or puts it back). With nothing held, presses anywhere but the tray do nothing.

import type { Hit } from '../view/canvas';
import type { InputAction } from './actions';

/** What a press did, for deciding what its release does. */
export interface Gesture {
  /** A chip is held now. */
  holding: boolean;
  /** This press picked the chip up (rather than carrying one already held). */
  pickedUp: boolean;
  /** The pointer went somewhere other than the tray during this press. */
  leftTray: boolean;
}

/** A press: the actions it starts with, or null when it starts nothing. */
export function press(hit: Hit | null, holding: boolean): InputAction[] | null {
  if (holding) return hit ? [carryTo(hit)] : null;
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
export function release(hit: Hit | null, gesture: Gesture): InputAction[] {
  if (!gesture.holding || isTap(hit, gesture)) return [];
  return RELEASES[hit?.zone ?? 'outside'](hit);
}

/** A pickup that never left the tray: keep holding the chip for the next tap. */
const isTap = (hit: Hit | null, { pickedUp, leftTray }: Gesture): boolean =>
  pickedUp && !leftTray && hit?.zone === 'tray';

const carryTo = ({ x, lift }: Hit): InputAction => ({ type: 'carry', x, lift });

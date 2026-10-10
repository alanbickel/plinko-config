// The README's examples. README.md carries copies of these regions;
// scripts/readme-examples.ts checks that they match.

// #region quick-start
import { createPlinko, PlinkoConfigError } from 'plinko-config';

type Setting = 'sound' | 'motion' | 'tips';
const settings: Partial<Record<Setting, boolean>> = {};

// <chip value, slot value>: types chip.value and slot.value in every callback.
const board = createPlinko<boolean, Setting>('#board', {
  slots: [
    { id: 'sound', label: 'Sound', value: 'sound' },
    { id: 'motion', label: 'Animations', value: 'motion' },
    { id: 'tips', label: 'Tips', value: 'tips' },
  ],
  chips: [
    { id: 'on', label: 'On', value: true },
    { id: 'off', label: 'Off', value: false },
  ],
  // A chip came to rest in a slot: which setting, and what to set it to.
  onLand: ({ chip, slot }) => {
    if (slot.value !== undefined && chip.value !== undefined) settings[slot.value] = chip.value;
  },
  // A chip came to rest short of every slot, on top of a full pile. Nothing changes.
  onMiss: ({ chip }) => {
    console.log(`${chip.label} missed`);
  },
});

// Later: board.destroy();
// #endregion quick-start

// #region update
// Change options on the live board. Slots, chips, board, physics, supply, and attribution
// are fixed at mount.
board.update({
  motion: 'reduced',
  labels: { board: 'Settings board' },
});
// #endregion update

// #region errors
// Invalid options throw before anything changes, from createPlinko() and update() alike.
try {
  board.update({ aimStep: 2 }); // must be in (0, 1]
} catch (error) {
  if (!(error instanceof PlinkoConfigError)) throw error;
  console.error(error.message); // names the offending option
}
// #endregion errors

board.destroy();

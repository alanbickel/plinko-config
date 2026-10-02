import { createPlinko } from 'plinko-config';

// #region keys
createPlinko('#board', {
  slots: [
    { id: 'light', label: 'Light', value: 'light' },
    { id: 'dark', label: 'Dark', value: 'dark' },
  ],
  chips: [{ id: 'theme', label: 'Theme' }],
  // Add WASD alongside the arrow keys. Each listed action replaces its default keys,
  // so keep the arrows in the list.
  keys: {
    left: ['ArrowLeft', 'a'],
    right: ['ArrowRight', 'd'],
    up: ['ArrowUp', 'w'],
    down: ['ArrowDown', 's'],
  },
});
// #endregion keys

// #region labels
createPlinko('#board', {
  // Chip and slot names are part of your data: they appear in the canvas and in announcements.
  slots: [
    { id: 'light', label: 'Clair', value: 'light' },
    { id: 'dark', label: 'Sombre', value: 'dark' },
  ],
  chips: [{ id: 'theme', label: 'Thème' }],
  // The board's own text comes from labels. Templates receive the chip (and slot) and
  // return the message.
  labels: {
    board: 'Préférences',
    roleDescription: 'jeu',
    landed: ({ chip, slot }) => `Jeton ${chip.label} posé sur ${slot.label}.`,
  },
});
// #endregion labels

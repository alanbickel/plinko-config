// #region mount
import { createPlinko } from 'plinko-config';

const board = createPlinko('#board', {
  slots: [
    { id: 'light', label: 'Light', value: 'light' },
    { id: 'dark', label: 'Dark', value: 'dark' },
    { id: 'system', label: 'System', value: 'system' },
  ],
  chips: [{ id: 'theme', label: 'Theme' }],
  onLand: ({ slot }) => {
    document.documentElement.dataset.theme = slot.value;
  },
});
// #endregion mount

// #region destroy
board.destroy();
// #endregion destroy

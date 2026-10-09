// Live example: a theme picker. A landing restyles the preview card.

// #region board
import { createPlinko } from 'plinko-config';

export function mount(target: HTMLElement, output: HTMLElement) {
  return createPlinko(target, {
    slots: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
      { id: 'system', label: 'System' },
    ],
    chips: [{ id: 'theme', label: 'Theme' }],
    board: { rows: 4, slotHeight: 1.5 },
    onLand: ({ slot }) => {
      output.dataset.theme = slot.id;
      output.textContent = `Theme: ${slot.label}`;
    },
  });
}
// #endregion board

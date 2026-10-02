// E2E fixture: <plinko-board> through the public element entry only. Not a demo page.
import '../../src/element';

const board = document.querySelector('plinko-board');
const events = document.getElementById('events');

for (const type of ['plinko-pick-up', 'plinko-drop', 'plinko-land', 'plinko-miss']) {
  document.addEventListener(type, () => {
    events?.append(Object.assign(document.createElement('li'), { textContent: type }));
  });
}

if (board) {
  board.options = {
    slots: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
    chips: [{ id: 'on', label: 'On' }],
    physics: { seed: 1 },
  };
}

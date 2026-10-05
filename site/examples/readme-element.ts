// The README's <plinko-board> example; README.md carries a copy of this region. See readme.ts.

// #region element
import 'plinko-config/element';
import type { PlinkoBoardElement } from 'plinko-config/element';

type Channel = 'email' | 'push' | 'sms';

// retrieve the board element
const el = document.querySelector<PlinkoBoardElement<boolean, Channel>>('plinko-board');

if (el) {
  // configure the board
  el.options = {
    slots: [
      { id: 'email', label: 'Email', value: 'email' },
      { id: 'push', label: 'Push', value: 'push' },
      { id: 'sms', label: 'SMS', value: 'sms' },
    ],
    chips: [
      { id: 'on', label: 'On', value: true },
      { id: 'off', label: 'Off', value: false },
    ],
  };

  // listen for outcomes
  el.addEventListener('plinko-land', (event) => {
    const { chip, slot } = event.detail;
    console.log(`${slot.value} notifications: ${chip.value ? 'on' : 'off'}`);
  });
}
// #endregion element

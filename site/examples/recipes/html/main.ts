// #region element
import 'plinko-config/element';
import type { PlinkoBoardElement } from 'plinko-config/element';

// The type arguments are the chip and slot value types; listeners get them in event.detail.
type Channel = 'email' | 'push' | 'sms';
const prefs = document.querySelector<PlinkoBoardElement<boolean, Channel>>('plinko-board');
if (prefs) {
  // Options are a property, not attributes: slots and chips are data.
  prefs.options = {
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
  // Every callback is also a bubbling plinko-* event.
  prefs.addEventListener('plinko-land', (event) => {
    const { chip, slot } = event.detail;
    console.log(`${slot.value} notifications: ${chip.value ? 'on' : 'off'}`);
  });
}
// #endregion element

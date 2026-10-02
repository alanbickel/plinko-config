// #region element
import 'plinko-config/element';

const prefs = document.querySelector('plinko-board');
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
    const { chip, slot } = (event as CustomEvent).detail;
    console.log(`${slot.value} notifications: ${chip.value ? 'on' : 'off'}`);
  });
}
// #endregion element

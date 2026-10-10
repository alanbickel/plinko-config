# plinko-config

_A delightfully sinister UI component._

![A Plinko board with Light, Dark, and System slots. Three chips are dragged onto it one at a time; as each lands, the card below switches to that theme.](https://raw.githubusercontent.com/alanbickel/plinko-config/main/.github/readme.gif)

## Gamify your settings. Drive your app with Plinko.

- Each slot on the board is a setting or an outcome; each chip is a value. When a chip lands, your app gets both.
- Framework-agnostic, and also available as a browser-native web component, `<plinko-board>`.
- Keyboard control, screen-reader announcements, reduced motion, and tap-or-drag input
  ([details](https://alanbickel.github.io/plinko-config/guide/accessibility)).
- Colors come from CSS custom properties.
- Zero runtime dependencies.

## What you can change

- Physics, board layout, labels, and styles.
- Chip supply: save counts with `onSupplyChange` and restore them across page loads and re-mounts.

**[Documentation](https://alanbickel.github.io/plinko-config/)** · [Getting started](https://alanbickel.github.io/plinko-config/guide/getting-started) · [API reference](https://alanbickel.github.io/plinko-config/api/)

> **Work in progress.** Not on npm yet.

## Install

```sh
npm install plinko-config
```

ESM only, with its own types.

## Quick start

Represent any setting, configuration, or outcome with `slots`. Define change values using `chips`. When a chip lands, `onLand` provides both `slot` and `chip`.

```ts
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
```

## Vanilla `<plinko-board>` element

This library exposes `plinko-board` as a custom web component, and a board can be initialized without calling `createPlinko()`.

Options can be set directly on the element instance, and event listeners can be manually registered. All events are prefixed with `plinko-`.

```html
<plinko-board style="height: 32rem"></plinko-board>
```

```ts
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
```

Setting `options` again updates the live board. The docs have [framework recipes](https://alanbickel.github.io/plinko-config/guide/frameworks) for React, Solid, and Angular.

## Changing a live board

```ts
// Change options on the live board. Slots, chips, board, physics, supply, and attribution
// are fixed at mount.
board.update({
  motion: 'reduced',
  labels: { board: 'Settings board' },
});
```

## Errors

```ts
// Invalid options throw before anything changes, from createPlinko() and update() alike.
try {
  board.update({ aimStep: 2 }); // must be in (0, 1]
} catch (error) {
  if (!(error instanceof PlinkoConfigError)) throw error;
  console.error(error.message); // names the offending option
}
```

The [docs](https://alanbickel.github.io/plinko-config/) cover chip supply, accessibility, and the full API.

## Development

```sh
npm install
npm run dev        # demo pages
npm run check      # lint, typecheck, test, build, size
npm run docs:dev   # docs site (run npm install in site/ first)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the Internals section of the docs site ([site/internals/](site/internals/)).

## Credits

Physics math adapted from [LittleJS](https://github.com/KilledByAPixel/LittleJS) by Frank Force (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT-0](LICENSE): use it however you like, no attribution required.

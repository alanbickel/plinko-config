# plinko-config

Game-ify your settings. Drive your app with Plinko.

A delightfully sinister UI component. Insanely configurable, framework-agnostic, a11y-first, with zero runtime dependencies.

**[Documentation](https://alanbickel.github.io/plinko-config/)** · [Getting started](https://alanbickel.github.io/plinko-config/guide/getting-started) · [API reference](https://alanbickel.github.io/plinko-config/api/)

> **Work in progress.** Not on npm yet.

## Install

```sh
npm install plinko-config
```

ESM only, with its own types.

## Quick start

```ts
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

// Later: board.destroy();
```

Prefer HTML? `import 'plinko-config/element'` and use `<plinko-board>`. The docs have [framework recipes](https://alanbickel.github.io/plinko-config/guide/frameworks) for React, Solid, and Angular, plus guides to chip supply and accessibility.

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

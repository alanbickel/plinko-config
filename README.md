# plinko-config

Set user preferences by playing Plinko. A deliberately terrible UI component.

> **Work in progress.** Nothing to install yet. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it's put together.

## Chip supply

Each chip kind has a `count` (leave it out for unlimited). Spent chips come back according to `supply.refill`:

```ts
createPlinko('#board', {
  slots,
  chips: [{ id: 'on', label: 'On', count: 3 }],
  supply: { refill: { mode: 'onRequest' } }, // or { mode: 'never' }, or { mode: 'interval', everyMs: 5000 }
  onRequest: async ({ chip }) => ((await askManager(chip.id)) ? 'grant' : 'deny'),
});
```

When every chip is spent and none can come back, the board locks for good.

### Keeping counts across page loads

The library never stores anything; your app owns its state. To keep chip counts, save the snapshot from `onSupplyChange` and pass it back as `count`:

```ts
const saved = JSON.parse(localStorage.getItem('plinko-supply') ?? '{"counts":{}}');

createPlinko('#board', {
  slots,
  chips: [{ id: 'on', label: 'On', count: saved.counts.on ?? 3 }],
  onSupplyChange: (snapshot) => localStorage.setItem('plinko-supply', JSON.stringify(snapshot)),
});
```

Unlimited counts are `Infinity`, which JSON stores as `null`. If you persist unlimited kinds, read them back with `?? Infinity`.

## Development

```sh
npm install
npm run dev      # demo page
npm run check    # lint, typecheck, test, build, size
```

## Credits

Physics math adapted from [LittleJS](https://github.com/KilledByAPixel/LittleJS) by Frank Force (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT-0](LICENSE): use it however you like, no attribution required.

# Contributing

## Setup

Node 22 or later.

```sh
npm install
npx playwright install chromium webkit   # once, for e2e tests
```

| Command | What it does |
|---|---|
| `npm run dev` | Demo pages: `/` (showcase), `/debug.html` (physics), `/runtime.html` (runtime) |
| `npm run check` | Lint, typecheck, unit tests, build, size budget |
| `npm run test:e2e` | Build, then run the Playwright suite in `e2e/` against `dist/` (desktop and Android Chromium, iPhone and iPad WebKit) |
| `npm run build && npx playwright test --ui` | The same suite in Playwright's UI: pick projects under **Projects**, press ▶ to run, then step through each action with before/after snapshots. Nothing runs until you press ▶; rebuild after library changes |
| `npm run mutate` | Stryker mutation testing of the sizing and label code (on demand; report in `reports/mutation/`) |
| `npm run sim -- --drops 5000 --x 0.5` | Headless physics simulation (options in `scripts/simulate.ts`) |
| `npm run docs:dev` | Docs site with live reload (run `npm install` in `site/` once first) |
| `npm run docs:build` | Build the docs site; fails on undocumented exports or dead links |
| `npm run docs:examples` | Type-check the docs examples and framework recipes |

Architecture is documented on the docs site, under Internals ([site/internals/](site/internals/)).

## Documentation

The docs site lives in `site/` (VitePress) and deploys to GitHub Pages from `main`. Most of it is generated from the code, so keep the code and its comments accurate:

- **Every public export needs a doc comment**, and so does each of its fields. The API reference is generated from them by TypeDoc, and the docs build fails if one is missing. Write for a developer who has never seen the library: say what it does and when to use it, not how it's implemented. Use `@defaultValue` for defaults.
- **Code examples are real files** in `site/examples/`, pulled into pages with `<<< ../examples/file.ts#region`. They're type-checked against `src/`, so an API change that breaks an example breaks the build. Don't paste untested code into a page.
- **`site/` is its own package**, pinned to TypeScript 6, because TypeDoc doesn't support TypeScript 7 yet. The library itself stays on TypeScript 7.

## Coding standards

These heuristics are meant to encourage healthy coding habits and avoid smells that invite defects.

Biome flags most violations as warnings with a suggested fix. Be kind to your fellow maintainers; if you wouldn't want to maintain it, don't commit it.

**Exceptions** are allowed but must be justified in writing. If the reason isn't worth writing, the exception isn't worth making. Exceptions to Biome-enforced rules must include a suppression comment:

```ts
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: one table of 40 key bindings reads better whole
```

Exceptions made in `biome.json` itself (which can't hold comments) are listed here:

- `**/*.vue`: `noUnusedVariables` and `noUnusedImports` are off. Biome only reads a `.vue` file's `<script>` block, so anything used only in the template looks unused.

**Scope:** code we own. Code and signatures we don't control follow their owners: vendored third-party code (`src/core/vendor/`) keeps its upstream form, and callbacks for the platform (DOM events, `Array.prototype` methods, test runners) take the parameters the platform passes.

### 1. Single-responsibility functions

Orchestrators (factories, wiring, event dispatch) delegate. Calculations and transformations live in their own named functions.

```ts
// ✗ wiring and measuring in one place
function createWidget(target: Target, options: WidgetOptions): Widget {
  const widget = new Widget();
  const padding = parseFloat(options.paddingTop) + parseFloat(options.paddingBottom);
  widget.host = { padding, height: target.clientHeight - padding - target.offsetHeight };

  // …

  return widget;
}

// ✓ the factory wires; the measurement is a function of its own
function createWidget(target: Target, options: WidgetOptions): Widget {
  const widget = new Widget();
  widget.host = measureHost({ target, options });

  // …

  return widget;
}

function measureHost({ target, options }: MeasureHostInput): HostSize {
  const padding = parseFloat(options.paddingTop) + parseFloat(options.paddingBottom);
  return { padding, height: target.clientHeight - padding - target.offsetHeight };
}
```

### 2. Rule of 30

At most 30 lines of logic per function (blank lines and comments don't count). Over that, split it or write down why not.

Biome can't skip comment lines, so it may warn a little early on a well-commented function. If the logic is within 30 lines, suppress it and say so (`…: 24 lines of logic; the rest are comments`), so the warning list stays meaningful.

### 3. Return early (guard clause)

Handle defaults, invalid input, and base cases first, then do the main work unindented.

```ts
// ✗
function nudge(dx: number) {
  if (state.name === 'holding') {
    aim(state.x + dx);
  }
}

// ✓
function nudge(dx: number) {
  if (state.name !== 'holding') return;
  aim(state.x + dx);
}
```

### 4. Look up, don't branch

Choosing between behaviours is a job for a map, not `if/else` or `switch`. `if/else` is a yellow flag; a lone guard clause (rule 3) is fine.

Type the map so every case must be handled. In this codebase, `HandlerMap` and `dispatchByType` (`src/runtime/dispatch.ts`) do this for any union with a "by type" interface.

```ts
// ✗
switch (notice.type) {
  case 'pickedUp': announce(labels.pickedUp(notice.kindId)); break;
  case 'cancelled': announce(labels.cancelled(notice.kindId)); break;
}

// ✓ adding a notice type without a handler is a compile error
interface NoticeByType {
  pickedUp: PickedUpNotice;
  cancelled: CancelledNotice;
}
type NoticeHandlers = { [K in keyof NoticeByType]: (n: NoticeByType[K]) => void };

const handlers: NoticeHandlers = {
  pickedUp: (n) => announce(labels.pickedUp(n.kindId)),
  cancelled: (n) => announce(labels.cancelled(n.kindId)),
};
```

### 5. Keep control flow flat

Nested conditionals, `else if` chains, and nested ternaries are red flags. There is always a flatter way: return early, look it up, or extract a function.

### 6. Keep complexity low

Count the decision points: each `if`, `?:`, `&&`/`||` used for control, loop, `case`, and `catch` counts as one. 5 or fewer is ideal. 6–8 is a yellow flag: write down why. 9 or more is a red flag.

### 7. At most two parameters

Three or more becomes one typed input object. Prefer an object even at two when the meaning isn't obvious from the call. Extending a function's arguments shouldn't break existing call sites.

```ts
// ✗ which is which?
settle(chip, true, events);

// ✓
settle({ chip, inSlot: true, events });
```

Public callbacks should always take one object.

```ts
onLand: ({ chip, slot, dropId }) => save(slot.id, chip.value),
```

### 8. Name your types

No anonymous object types in parameters, return types, properties, generic arguments, or union members. Derived types (`Partial<T>`, `Pick<T, K>`, `Extract<T, U>`) are fine.

```ts
// ✗ each member is anonymous; easy to break one without noticing
type WorldEvent =
  | { type: 'landed'; chip: ChipBody; slotIndex: number }
  | { type: 'missed'; chip: ChipBody };

// ✓
interface LandedEvent { type: 'landed'; chip: ChipBody; slotIndex: number }
interface MissedEvent { type: 'missed'; chip: ChipBody }
type WorldEvent = LandedEvent | MissedEvent;
```

## Tests

- Unit tests sit next to the code (`foo.ts` → `foo.test.ts`) and run in Node.
- DOM tests opt into jsdom with `// @vitest-environment jsdom` on the first line.
- Anything that needs real layout, canvas, or focus goes in `e2e/` (Playwright). Specs mount the built package on `e2e/harness/` with `mountBoard` or `mountElement` from `e2e/fixtures.ts`, never on the demo pages. Running `playwright test` directly needs a fresh `npm run build`; the suite refuses a `dist/` older than `src/`.
- A regression test says which bug it guards against.
- The coding standards apply to tests too. Biome skips the length check there, since a `describe` block groups many tests; keep each test itself within the rule of 30.
- Physics changes come with before/after numbers from `npm run sim`.

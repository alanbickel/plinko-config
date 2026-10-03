# plinko-config

Follow [CONTRIBUTING.md](CONTRIBUTING.md): its coding standards apply to every change. Architecture: [site/internals/](site/internals/) (behaviour hosts rely on: [site/lifecycle/](site/lifecycle/), [site/contracts/](site/contracts/)).

- `src/core/` is pure TypeScript (no DOM, timers, or `Math.random`); `src/runtime/` owns the DOM. Biome enforces the boundary.
- Verify with `npm run check`; run `npm run test:e2e` for runtime or demo changes.
- For physics changes, compare `npm run sim` output before and after.
- Public API changes need doc comments; verify with `npm run docs:build`.
- Debug pages (`demo/debug.html`, `demo/runtime.html`) use the public API only.
- Vendored code in `src/core/vendor/` keeps its upstream form.

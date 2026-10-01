# Vendored LittleJS helpers

A small subset of [LittleJS](https://github.com/KilledByAPixel/LittleJS) math, copied in rather than installed as a dependency.

| | |
|---|---|
| Upstream | `littlejsengine@1.22.0`, `src/engineMath.js` |
| License | MIT, see [LICENSE](./LICENSE). The notice is also kept at the top of `math.ts`. |
| Vendored | `clamp`, `lerp`, `Vector2` (subset), `vec2`, `collideCircleCircle`, `collideCircleBox` (+ its private `pushOutAxis`) |
| Changes | Converted to TypeScript, trimmed `Vector2` to the methods we use, debug asserts removed. Behaviour unchanged. |

## Why vendor instead of depending on `littlejsengine`?

- The package ships as a single ES module with top-level side effects, so bundlers can't tree-shake it. Importing just these helpers pulled in about 208 KB minified (78 KB gzipped), measured against 1.22.0.
- We only need a few pure functions. The engine itself (`engineInit`) is a page-wide singleton with no teardown, which doesn't fit a component library.

## Updating

Copy the functions from the new upstream `src/engineMath.js`, keep the license header, update the version above, and run `npm test`. `math.test.ts` pins the behaviour we rely on.

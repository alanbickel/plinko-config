---
description: Use plinko-config as a Web Component, or wrap it in React, Solid, or Angular.
---

# Frameworks

plinko-config doesn't depend on any framework. Use the `<plinko-board>` element, or call `createPlinko()` from a component. Each recipe below builds the same notification-preferences board: drop an **On** or **Off** chip into **Email**, **Push**, or **SMS**.

Every recipe follows the same pattern:

1. Mount once, when the component mounts.
2. Send later changes (callbacks, labels, theme, styles) to the live board with `board.update()`. Slots, chips, and the piles of landed chips stay put.
3. Call `destroy()` when the component unmounts.

## Web Component

Importing `plinko-config/element` registers `<plinko-board>`. Pass options as a property, not attributes, because they hold arrays and functions. Every callback is also a bubbling `plinko-*` DOM event.

<<< ../examples/recipes/html/index.html#markup

<<< ../examples/recipes/html/main.ts#element

## React

<<< ../examples/recipes/react/PlinkoPreferences.tsx#component

## Solid

<<< ../examples/recipes/solid/PlinkoPreferences.tsx#component

## Angular

<<< ../examples/recipes/angular/plinko-preferences.component.ts#component

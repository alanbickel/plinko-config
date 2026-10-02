// DOM listeners on the canvas: keys and pointer gestures become actions; focus is tracked for the
// focus ring.

import type { BoardContext } from '../context';
import { defaultLiftSteps, type LiftSteps } from '../view/geometry';
import { interpretKey, type KeyContext } from './keyboard';
import { createPerform, type Perform } from './perform';
import { attachPointer } from './pointer-dom';

/** Listens on the canvas; returns a function that removes the listeners. */
export function attachInput(ctx: BoardContext): () => void {
  const { canvas } = ctx.dom;
  const perform = createPerform(ctx);
  const onKeyDown = (e: KeyboardEvent) => handleKey(ctx, { event: e, perform });
  const onFocus = () => setFocused(ctx, focusVisible(canvas));
  const onBlur = () => setFocused(ctx, false);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('focus', onFocus);
  canvas.addEventListener('blur', onBlur);
  const detachPointer = attachPointer(ctx, perform);
  return () => {
    canvas.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('focus', onFocus);
    canvas.removeEventListener('blur', onBlur);
    detachPointer();
  };
}

interface KeyEventInput {
  event: KeyboardEvent;
  perform: Perform;
}

function handleKey(ctx: BoardContext, { event, perform }: KeyEventInput): void {
  // Modified keys belong to the browser and the host page.
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  // Focus that came from a click shows no ring until the keyboard is used.
  if (!ctx.ui.focused) setFocused(ctx, true);
  const action = interpretKey(event, keyContext(ctx));
  if (!action) return;
  event.preventDefault();
  perform([action]);
}

function keyContext(ctx: BoardContext): KeyContext {
  const { machine, ui, config, kindIds } = ctx;
  return {
    holding: machine.state.name === 'holding',
    selected: ui.selected,
    kindCount: kindIds.length,
    aimStep: config.aimStep,
    aimStepLarge: config.aimStepLarge,
    ...liftSteps(ctx),
    keys: config.keys,
  };
}

/** The host's lift steps, or one and four peg rows of the board's current carry path. */
function liftSteps({ config, carry }: BoardContext): LiftSteps {
  const defaults = defaultLiftSteps(carry);
  return {
    liftStep: config.liftStep ?? defaults.liftStep,
    liftStepLarge: config.liftStepLarge ?? defaults.liftStepLarge,
  };
}

/** Whether the browser would show a focus ring: focus by keyboard, not by click. */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true; // No :focus-visible support: always show the ring.
  }
}

function setFocused(ctx: BoardContext, focused: boolean): void {
  ctx.ui.focused = focused;
  ctx.loop.redraw();
}

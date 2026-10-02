// DOM listeners on the canvas: keys become actions; focus is tracked for the focus ring.

import { announceSelected, type BoardContext, refresh } from '../context';
import { dispatchByType, type HandlerMap } from '../dispatch';
import { interpretKey, type KeyAction, type KeyActionByType, type KeyContext } from './keyboard';

type KeyActionHandlers = HandlerMap<KeyActionByType>;

/** Listens on the canvas; returns a function that removes the listeners. */
export function attachInput(ctx: BoardContext): () => void {
  const { canvas } = ctx.dom;
  const handlers = keyActionHandlers(ctx);
  const onKeyDown = (e: KeyboardEvent) => handleKey(ctx, { event: e, handlers });
  const onFocus = () => setFocused(ctx, true);
  const onBlur = () => setFocused(ctx, false);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('focus', onFocus);
  canvas.addEventListener('blur', onBlur);
  return () => {
    canvas.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('focus', onFocus);
    canvas.removeEventListener('blur', onBlur);
  };
}

interface KeyEventInput {
  event: KeyboardEvent;
  handlers: KeyActionHandlers;
}

function handleKey(ctx: BoardContext, { event, handlers }: KeyEventInput): void {
  // Modified keys belong to the browser and the host page.
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const action = interpretKey(event, keyContext(ctx));
  if (!action) return;
  event.preventDefault();
  if (ctx.machine.state.name === 'locked') {
    refuseWhileLocked(ctx, action);
    return;
  }
  dispatchByType(handlers, action);
  refresh(ctx);
}

/** A locked board ignores keys, but trying to pick up repeats why. */
function refuseWhileLocked(ctx: BoardContext, action: KeyAction): void {
  if (action.type === 'pickUp') ctx.announcer.say(ctx.config.labels.locked);
}

function keyActionHandlers(ctx: BoardContext): KeyActionHandlers {
  const { machine, ui } = ctx;
  return {
    select: ({ index }) => {
      ui.selected = index;
      announceSelected(ctx);
    },
    pickUp: ({ index }) => {
      machine.pickUp(ctx.kindIds[index] ?? '');
    },
    nudge: ({ dx }) => machine.nudge(dx),
    aim: ({ x }) => machine.aim(x),
    drop: () => {
      machine.drop();
    },
    cancel: () => machine.cancel(),
    zone: ({ zone }) => {
      ui.zone = zone;
      announceSelected(ctx);
    },
  };
}

function keyContext(ctx: BoardContext): KeyContext {
  const { machine, ui, config, kindIds } = ctx;
  const lastKind = machine.lastKind;
  return {
    zone: ui.zone,
    holding: machine.state.name === 'holding',
    selected: ui.selected,
    kindCount: kindIds.length,
    lastKindIndex: lastKind === undefined ? undefined : kindIds.indexOf(lastKind),
    aimStep: config.aimStep,
    aimStepLarge: config.aimStepLarge,
    keys: config.keys,
  };
}

function setFocused(ctx: BoardContext, focused: boolean): void {
  ctx.ui.focused = focused;
  ctx.loop.redraw();
}

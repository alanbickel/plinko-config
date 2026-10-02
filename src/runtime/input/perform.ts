// Applies input actions to the board. Keyboard and pointer both come through here.

import { announceSelected, type BoardContext, refresh } from '../context';
import { dispatchByType, type HandlerMap } from '../dispatch';
import { requestChips } from '../supply';
import type { InputAction, InputActionByType } from './actions';

/** Applies actions in order, then redraws. */
export type Perform = (actions: readonly InputAction[]) => void;

export function createPerform(ctx: BoardContext): Perform {
  const handlers = actionHandlers(ctx);
  return (actions) => {
    if (actions.length === 0) return;
    for (const action of actions) apply(ctx, { action, handlers });
    refresh(ctx);
  };
}

interface ApplyInput {
  action: InputAction;
  handlers: HandlerMap<InputActionByType>;
}

function apply(ctx: BoardContext, { action, handlers }: ApplyInput): void {
  if (ctx.machine.state.name === 'locked') {
    refuseWhileLocked(ctx, action);
    return;
  }
  dispatchByType(handlers, action);
}

/** A locked board ignores input, but trying to pick up repeats why. */
function refuseWhileLocked(ctx: BoardContext, action: InputAction): void {
  if (action.type === 'pickUp') ctx.announcer.say(ctx.config.labels.locked);
}

function actionHandlers(ctx: BoardContext): HandlerMap<InputActionByType> {
  const { machine, ui } = ctx;
  return {
    select: ({ index }) => {
      ui.selected = index;
      announceSelected(ctx);
    },
    pickUp: ({ index }) => {
      ui.selected = index;
      pickUpOrRequest(ctx, ctx.kindIds[index] ?? '');
    },
    nudge: ({ dx }) => machine.nudge(dx),
    aim: ({ x }) => machine.aim(x),
    lift: ({ dy }) => machine.lift(dy),
    carry: ({ x, lift }) => {
      machine.aim(x);
      machine.liftTo(lift);
    },
    drop: ({ reload }) => {
      machine.drop({ reload });
    },
    lose: () => machine.lose(),
    cancel: () => machine.cancel(),
  };
}

/** Picking up an empty kind that can be requested asks for more; otherwise it picks one up. */
function pickUpOrRequest(ctx: BoardContext, kindId: string): void {
  if (ctx.supply.canRequest(kindId)) {
    void requestChips(ctx, kindId);
    return;
  }
  ctx.machine.pickUp(kindId);
}

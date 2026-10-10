// The public handle returned by createPlinko().

import { type BoardContext, heldChip } from './context';
import { keySteps } from './input/attach';
import { applyPause } from './observe';
import { requestChips, supplyChanged } from './supply';
import type { DropOptions, PlinkoBoard, Settled, SupplyController } from './types';
import { updateBoard } from './update';

export interface HandleInput {
  ctx: BoardContext;
  /** Stops listeners and observers; run once on destroy(). */
  teardown: readonly (() => void)[];
}

export function createHandle({ ctx, teardown }: HandleInput): PlinkoBoard {
  const { machine } = ctx;
  let destroyed = false;
  return {
    element: ctx.dom.wrapper,
    pickUp: (chipId) => machine.pickUp(chipId),
    aim: (x) => machine.aim(x),
    cancel: () => machine.cancel(),
    keySteps: () => keySteps(ctx),
    drop: (options = {}) => drop(ctx, options),
    supply: supplyController(ctx),
    pause: () => setPausedByHost(ctx, true),
    resume: () => setPausedByHost(ctx, false),
    update: (options) => {
      if (!destroyed) updateBoard(ctx, options);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      destroyBoard({ ctx, teardown });
    },
  };
}

/** Host overrides go through the same reporting (and exhaustion check) as everything else. */
function supplyController(ctx: BoardContext): SupplyController {
  return {
    get: () => ctx.supply.snapshot(),
    set: (update) => {
      ctx.supply.set(update);
      supplyChanged(ctx);
    },
    add: (update) => {
      ctx.supply.add(update);
      supplyChanged(ctx);
    },
    request: ({ chip }) => requestChips(ctx, chip),
  };
}

function drop(ctx: BoardContext, options: DropOptions): Promise<Settled> {
  const { machine, ui } = ctx;
  const stateBefore = machine.state.name;
  const kindId = options.chip ?? defaultKind(ctx);
  if (!machine.pickUp(kindId)) return fail(`can't pick up "${kindId}" (${stateBefore})`);
  if (options.x !== undefined) machine.aim(options.x);
  ui.pendingSeed = options.seed;
  // Scripted drops go straight to the drop zone; only people can lose chips.
  const dropId = machine.drop({ carryUp: true });
  ui.pendingSeed = undefined;
  if (dropId === undefined) return fail(`can't drop (${machine.state.name})`);
  return new Promise<Settled>((resolve) => ctx.settling.set(dropId, resolve));
}

/** The held kind, else the last one used, else the one selected in the tray. */
function defaultKind(ctx: BoardContext): string {
  return heldChip(ctx)?.kindId ?? ctx.machine.lastKind ?? ctx.kindIds[ctx.ui.selected] ?? '';
}

function fail(reason: string): Promise<Settled> {
  return Promise.reject(new Error(`plinko-config: ${reason}`));
}

function setPausedByHost(ctx: BoardContext, paused: boolean): void {
  ctx.ui.pausedByHost = paused;
  applyPause(ctx);
}

function destroyBoard({ ctx, teardown }: HandleInput): void {
  ctx.machine.destroy();
  ctx.loop.stop();
  ctx.announcer.destroy();
  for (const stop of teardown) stop();
  // Chips vanish with the board, so they are no longer in flight.
  for (const [dropId, resolve] of ctx.settling) resolve({ dropId });
  ctx.settling.clear();
  ctx.dom.wrapper.remove();
}

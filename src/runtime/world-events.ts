// What the board does with physics events: host callbacks, announcements, settling drop() promises.

import type { ChipBody, LandedEvent, PegHitEvent, WorldEventByType } from '../core/world';
import { STEP } from '../core/world';
import { type BoardContext, callHost, kindOf } from './context';
import { dispatchByType, type HandlerMap } from './dispatch';
import { lockBoard } from './lock';
import type { MissDetails } from './types';

export type WorldEventHandlers = HandlerMap<WorldEventByType>;

export function worldEventHandlers(ctx: BoardContext): WorldEventHandlers {
  return {
    pegHit: (e) => onPegHit(ctx, e),
    landed: (e) => onLanded(ctx, e),
    missed: ({ chip }) => onMissed(ctx, chip),
    full: ({ reason }) => lockBoard(ctx, reason),
  };
}

/** Sends out everything stepped since the last frame. */
export function dispatchWorldEvents(ctx: BoardContext, handlers: WorldEventHandlers): void {
  const batch = ctx.events;
  ctx.events = [];
  for (const event of batch) dispatchByType(handlers, event);
}

function onPegHit(ctx: BoardContext, { chip, pegIndex, speed }: PegHitEvent): void {
  ctx.ui.lastPegHit = performance.now();
  ctx.ui.pegHits.set(pegIndex, ctx.ui.lastPegHit);
  callHost(ctx.options.onPegHit, {
    chip: kindOf(ctx, chip.kindId),
    dropId: chip.id,
    dropX: chip.dropX,
    pegIndex,
    speed,
  });
}

function onLanded(ctx: BoardContext, { chip, slotIndex }: LandedEvent): void {
  const details = missDetails(ctx, chip);
  const slot = ctx.slots[slotIndex] as (typeof ctx.slots)[number];
  callHost(ctx.options.onLand, { ...details, slot });
  ctx.announcer.landedIn({ chip: details.chip, slot });
  settle(ctx, chip.id);
}

function onMissed(ctx: BoardContext, chip: ChipBody): void {
  const details = missDetails(ctx, chip);
  callHost(ctx.options.onMiss, details);
  ctx.announcer.missedBy(details.chip);
  settle(ctx, chip.id);
}

/** Everything hosts learn about a settled chip (a landing adds the slot). */
function missDetails(ctx: BoardContext, chip: ChipBody): MissDetails {
  return {
    chip: kindOf(ctx, chip.kindId),
    dropId: chip.id,
    dropX: chip.dropX,
    pegHits: chip.pegHits,
    durationMs: Math.round(chip.ageSteps * STEP * 1000),
    seed: chip.seed,
  };
}

/** Resolves the drop() promise for this chip, if there is one. */
function settle(ctx: BoardContext, dropId: number): void {
  ctx.settling.get(dropId)?.({ dropId });
  ctx.settling.delete(dropId);
}

// What the board does when the held-chip state machine reports a change.

import { dropXToBoard } from '../core/layout';
import type { DroppedNotice, LostNotice, NoticeHandlers, PickedUpNotice } from './commands';
import { type BoardContext, callHost, kindOf, stockOf } from './context';
import { reportIfExhausted } from './supply';
import { liftToY } from './view/geometry';

// Handlers read ctx.config and ctx.announcer when they run, never earlier: board.update() can
// replace the labels at any time.
export function noticeHandlers(ctx: BoardContext): NoticeHandlers {
  const labels = () => ctx.config.labels;
  const say = (text: string) => ctx.announcer.say(text);
  const chip = (kindId: string) => ({ chip: kindOf(ctx, kindId) });
  const ignore = () => {};
  return {
    aimed: ignore,
    lifted: ignore,
    destroyed: ignore,
    pickedUp: (n) => onPickedUp(ctx, n),
    zoneChanged: ({ inZone }) => say(inZone ? labels().enteredDropZone : labels().leftDropZone),
    dropped: (n) => onDropped(ctx, n),
    lost: (n) => onLost(ctx, n),
    locked: () => onLocked(ctx),
    outOfChips: ({ kindId }) => {
      // A locked board has already said its last word.
      if (!ctx.ui.lockReason) say(labels().outOfChips(stockOf(ctx, kindId)));
    },
    busy: () => say(labels().busy),
    cancelled: ({ kindId }) => say(labels().cancelled(chip(kindId))),
  };
}

function onPickedUp(ctx: BoardContext, { kindId }: PickedUpNotice): void {
  const chip = kindOf(ctx, kindId);
  ctx.ui.selected = ctx.kindIds.indexOf(kindId);
  callHost(ctx.options.onPickUp, { chip });
  ctx.announcer.say(ctx.config.labels.pickedUp({ chip }));
}

function onDropped(ctx: BoardContext, { kindId, dropId, x, reloaded }: DroppedNotice): void {
  const chip = kindOf(ctx, kindId);
  callHost(ctx.options.onDrop, { chip, dropId, dropX: x });
  // With auto-reload the pickup that follows is the more useful thing to hear.
  if (reloaded) return;
  ctx.announcer.say(ctx.config.labels.dropped({ chip }));
  reportIfExhausted(ctx, kindId);
}

/** No callbacks, on purpose: the chip just falls off the board. Screen readers still hear it. */
function onLost(ctx: BoardContext, { kindId, x, lift }: LostNotice): void {
  const from = ctx.ui.dragPoint ?? {
    x: dropXToBoard(ctx.world.layout, x),
    y: liftToY(ctx.carry, lift),
  };
  ctx.ui.falling.push({ kindId, from, startedAt: performance.now() });
  ctx.announcer.say(ctx.config.labels.fellOff({ chip: kindOf(ctx, kindId) }));
  reportIfExhausted(ctx, kindId);
}

function onLocked(ctx: BoardContext): void {
  // Announce the landing that filled the board first, so the lock message is the last word.
  ctx.announcer.flush();
  ctx.announcer.say(ctx.config.labels.locked);
}

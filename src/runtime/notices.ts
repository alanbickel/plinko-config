// What the board does when the held-chip state machine reports a change.

import type { DroppedNotice, NoticeHandlers, PickedUpNotice } from './commands';
import { type BoardContext, callHost, kindOf, stockOf } from './context';
import { reportIfExhausted } from './supply';

export function noticeHandlers(ctx: BoardContext): NoticeHandlers {
  const { announcer, config } = ctx;
  const chip = (kindId: string) => ({ chip: kindOf(ctx, kindId) });
  const ignore = () => {};
  return {
    aimed: ignore,
    destroyed: ignore,
    pickedUp: (n) => onPickedUp(ctx, n),
    dropped: (n) => onDropped(ctx, n),
    locked: () => onLocked(ctx),
    outOfChips: ({ kindId }) => {
      // A locked board has already said its last word.
      if (!ctx.ui.lockReason) announcer.say(config.labels.outOfChips(stockOf(ctx, kindId)));
    },
    busy: () => announcer.say(config.labels.busy),
    cancelled: ({ kindId }) => {
      ctx.ui.zone = 'tray';
      announcer.say(config.labels.cancelled(chip(kindId)));
    },
  };
}

function onPickedUp(ctx: BoardContext, { kindId }: PickedUpNotice): void {
  const chip = kindOf(ctx, kindId);
  ctx.ui.zone = 'board';
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

function onLocked(ctx: BoardContext): void {
  ctx.ui.zone = 'tray';
  ctx.ui.lockedMessage = ctx.config.labels.locked;
  // Announce the landing that filled the board first, so the lock message is the last word.
  ctx.announcer.flush();
  ctx.announcer.say(ctx.config.labels.locked);
}

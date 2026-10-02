// The one way a board locks, whatever the reason.

import { type BoardContext, callHost } from './context';
import type { FullReason } from './types';

/** Locks the board for good. The first reason wins; onFull fires exactly once. */
export function lockBoard(ctx: BoardContext, reason: FullReason): void {
  if (ctx.ui.lockReason) return;
  ctx.ui.lockReason = reason;
  callHost(ctx.options.onFull, { reason });
  ctx.machine.lock();
}

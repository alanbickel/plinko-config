// The frame loop's callbacks: step the world, dispatch its events, draw.

import { type BoardContext, heldChip } from './context';
import { FrameLoop } from './loop';
import { type FrameState, PEG_FLASH_MS } from './view/canvas';
import { dispatchWorldEvents, worldEventHandlers } from './world-events';

export function createLoop(ctx: BoardContext): FrameLoop {
  const handlers = worldEventHandlers(ctx);
  return new FrameLoop({
    step: () => {
      ctx.events.push(...ctx.world.step());
    },
    render: (alpha) => {
      dispatchWorldEvents(ctx, handlers); // after stepping, never mid-step (ARCHITECTURE.md §9)
      ctx.view.render(frameState(ctx, alpha));
    },
    active: () => isAnimating(ctx),
  });
}

function frameState(ctx: BoardContext, alpha: number): FrameState {
  const { world, ui, chips } = ctx;
  return {
    flying: world.flying,
    settled: world.landed,
    held: heldChip(ctx),
    selected: ui.selected,
    zone: ui.zone,
    focused: ui.focused,
    counts: chips.map((c) => ctx.supply.count(c.id)),
    trayNotes: chips.map((c) => trayNote(ctx, c.id)),
    lockedMessage: ui.lockedMessage,
    pegHits: ui.pegHits,
    alpha,
    now: performance.now(),
  };
}

/** Under an empty kind: whether more can be requested, or a request is waiting. */
function trayNote(ctx: BoardContext, kindId: string): string | undefined {
  const { labels } = ctx.config;
  if (ctx.requests.has(kindId)) return labels.requestPending;
  return ctx.supply.canRequest(kindId) ? labels.requestMore : undefined;
}

/** Anything moving, waiting to be dispatched, or still lit up. */
function isAnimating({ world, events, ui }: BoardContext): boolean {
  const pegLit = performance.now() - ui.lastPegHit < PEG_FLASH_MS;
  return world.flying.length > 0 || events.length > 0 || pegLit;
}

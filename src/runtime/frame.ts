// The frame loop's callbacks: step the world, dispatch its events, draw.

import { type BoardContext, heldChip, zoneOf } from './context';
import { FrameLoop } from './loop';
import { type DropZoneLook, type FrameState, type HeldChip, PEG_FLASH_MS } from './view/canvas';
import { FALL_MS } from './view/geometry';
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
  const now = performance.now();
  ui.falling = ui.falling.filter((chip) => now - chip.startedAt < FALL_MS);
  return {
    flying: world.flying,
    settled: world.landed,
    held: held(ctx),
    dropZone: dropZoneLook(ctx),
    falling: ui.falling,
    selected: ui.selected,
    zone: zoneOf(ctx),
    focused: ui.focused,
    counts: chips.map((c) => ctx.supply.count(c.id)),
    trayNotes: chips.map((c) => trayNote(ctx, c.id)),
    lockedMessage: ui.lockedMessage,
    pegHits: ui.pegHits,
    alpha,
    now,
  };
}

/** The held chip: under the pointer during a drag, otherwise on the carry path. */
function held(ctx: BoardContext): HeldChip | undefined {
  const chip = heldChip(ctx);
  if (!chip) return undefined;
  return { kindId: chip.kindId, x: chip.x, lift: chip.lift, at: ctx.ui.dragPoint };
}

/** Outlined while a chip is held, lit while it's inside. */
function dropZoneLook(ctx: BoardContext): DropZoneLook {
  const chip = heldChip(ctx);
  if (!chip) return 'hidden';
  return chip.lift >= ctx.carry.zoneFrom ? 'lit' : 'shown';
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
  const moving = world.flying.length > 0 || ui.falling.length > 0;
  return moving || events.length > 0 || pegLit;
}

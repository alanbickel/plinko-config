// Pointer listeners on the canvas: tracks one press at a time, hit-tests each event, and hands the
// gesture rules in pointer.ts the result. Pointer capture keeps a drag's release even off the canvas.

import { type BoardContext, heldChip, refresh } from '../context';
import type { Hit } from '../view/canvas';
import type { Perform } from './perform';
import { move, press, release } from './pointer';

interface PointerSession {
  ctx: BoardContext;
  perform: Perform;
  /** The pointer of the press in progress, if any. */
  pointerId: number | undefined;
}

type PointerHandler = (session: PointerSession, event: PointerEvent) => void;

const LISTENERS: Record<string, PointerHandler> = {
  pointerdown: onDown,
  pointermove: onMove,
  pointerup: onUp,
  pointercancel: onCancel,
};

/** Listens for pointer events on the canvas; returns a function that removes the listeners. */
export function attachPointer(ctx: BoardContext, perform: Perform): () => void {
  const session: PointerSession = { ctx, perform, pointerId: undefined };
  const bound = Object.entries(LISTENERS).map(([type, handler]) => {
    const listener = (e: Event) => handler(session, e as PointerEvent);
    ctx.dom.canvas.addEventListener(type, listener);
    return [type, listener] as const;
  });
  return () => {
    for (const [type, listener] of bound) ctx.dom.canvas.removeEventListener(type, listener);
  };
}

function onDown(session: PointerSession, event: PointerEvent): void {
  if (session.pointerId !== undefined || !event.isPrimary || event.button !== 0) return;
  const { ctx } = session;
  const hit = hitAt(ctx, event);
  const actions = press(hit);
  if (!actions || !hit) return;
  // Take focus without the browser's scroll, and keep the press from selecting page text.
  event.preventDefault();
  ctx.dom.canvas.focus({ preventScroll: true });
  // Focus from a press shows no ring, whatever :focus-visible says; a key press brings it back.
  ctx.ui.focused = false;
  ctx.dom.canvas.setPointerCapture?.(event.pointerId);
  session.pointerId = event.pointerId;
  ctx.ui.dragPoint = hit.point;
  session.perform(actions);
  if (heldChip(ctx)) bringIntoView(ctx);
  else endDrag(session); // Nothing to carry: none left, or a request for more.
  updateCursor(session, hit);
}

function onMove(session: PointerSession, event: PointerEvent): void {
  const hit = hitAt(session.ctx, event);
  updateCursor(session, hit);
  if (session.pointerId !== event.pointerId || !hit) return;
  session.ctx.ui.dragPoint = hit.point;
  session.perform(move(hit));
}

function onUp(session: PointerSession, event: PointerEvent): void {
  if (session.pointerId !== event.pointerId) return;
  const hit = hitAt(session.ctx, event);
  // The drag point is still set, so a lost chip starts falling from under the pointer.
  session.perform(release(hit, Boolean(heldChip(session.ctx))));
  endDrag(session);
  updateCursor(session, hit);
}

/** The browser took the pointer (e.g. a system gesture): not the visitor's fault, so put it back. */
function onCancel(session: PointerSession, event: PointerEvent): void {
  if (session.pointerId !== event.pointerId) return;
  session.perform([{ type: 'cancel' }]);
  endDrag(session);
}

function endDrag(session: PointerSession): void {
  session.pointerId = undefined;
  session.ctx.ui.dragPoint = undefined;
  refresh(session.ctx);
}

function hitAt(ctx: BoardContext, event: PointerEvent): Hit | null {
  const rect = ctx.dom.canvas.getBoundingClientRect();
  return ctx.view.hitTest({ x: event.clientX - rect.left, y: event.clientY - rect.top });
}

/**
 * A touch drag can't scroll the page, so a pickup with part of the board off-screen scrolls it
 * into view: the visitor must be able to see where they're carrying the chip.
 */
function bringIntoView(ctx: BoardContext): void {
  const behavior = ctx.reducedMotion ? 'auto' : 'smooth';
  ctx.dom.canvas.scrollIntoView?.({ block: 'nearest', behavior });
}

function updateCursor(session: PointerSession, hit: Hit | null): void {
  session.ctx.dom.canvas.style.cursor = cursorFor(session, hit);
}

function cursorFor({ ctx, pointerId }: PointerSession, hit: Hit | null): string {
  if (ctx.machine.state.name === 'locked') return '';
  if (pointerId !== undefined) return 'grabbing';
  return hit?.zone === 'tray' ? 'grab' : '';
}

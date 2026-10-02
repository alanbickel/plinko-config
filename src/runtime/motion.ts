// Reduced motion: the host's `motion` option, and for 'auto' the visitor's prefers-reduced-motion
// setting, followed live. The listener sits on the media query, never on window.

import type { BoardContext } from './context';
import type { MotionPreference } from './types';

const QUERY = '(prefers-reduced-motion: reduce)';

/** The visitor's reduced-motion media query, where there is one (not in every environment). */
export function motionQuery(win: Window | null): MediaQueryList | undefined {
  return win?.matchMedia?.(QUERY);
}

const REDUCED: Record<MotionPreference, (query: MediaQueryList | undefined) => boolean> = {
  auto: (query) => query?.matches ?? false,
  full: () => false,
  reduced: () => true,
};

export interface MotionInput {
  preference: MotionPreference;
  query: MediaQueryList | undefined;
}

export const isReduced = ({ preference, query }: MotionInput): boolean =>
  REDUCED[preference](query);

/** Re-reads the preference (after update(), or when the visitor's setting changes). */
export function applyMotion(ctx: BoardContext): void {
  const reduced = isReduced({ preference: ctx.config.motion, query: ctx.motionQuery });
  ctx.reducedMotion = reduced;
  ctx.view.setReducedMotion(reduced);
  ctx.loop.redraw();
}

/** Follows changes to the visitor's setting; returns a function that stops. */
export function watchMotion(ctx: BoardContext): () => void {
  const onChange = () => applyMotion(ctx);
  ctx.motionQuery?.addEventListener?.('change', onChange);
  return () => ctx.motionQuery?.removeEventListener?.('change', onChange);
}

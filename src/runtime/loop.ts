// requestAnimationFrame + fixed-step accumulator (ARCHITECTURE.md §9). Sleeps when idle: no frames
// are requested until wake(). Hidden tabs get no RAF callbacks anyway, and the clamp below stops a
// burst of catch-up steps when the tab comes back.

import { STEP } from '../core/world';

const MAX_FRAME_MS = 250;

export interface LoopCallbacks {
  /** One fixed simulation step. */
  step(): void;
  /** Draw; alpha ∈ [0, 1) is how far we are between the last step and the next. */
  render(alpha: number): void;
  /** Whether there's anything to animate. When false after a frame, the loop sleeps. */
  active(): boolean;
}

export class FrameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private stopped = false;

  constructor(private readonly cb: LoopCallbacks) {}

  /** Starts frames if sleeping. Safe to call often. */
  wake(): void {
    if (this.raf || this.paused || this.stopped) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Draws once without simulating, e.g. after a resize or theme change. */
  redraw(): void {
    if (!this.raf && !this.stopped) this.cb.render(0);
  }

  pause(): void {
    this.paused = true;
    this.cancel();
  }

  resume(): void {
    this.paused = false;
    this.wake();
  }

  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  private cancel(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number): void => {
    this.raf = 0;
    this.acc += Math.min(now - this.last, MAX_FRAME_MS) / 1000;
    this.last = now;
    while (this.acc >= STEP) {
      this.cb.step();
      this.acc -= STEP;
    }
    this.cb.render(this.acc / STEP);
    if (this.cb.active() && !this.paused && !this.stopped) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.acc = 0;
    }
  };
}

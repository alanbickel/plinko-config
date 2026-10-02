// Screen-reader announcements through the board's own aria-live region.

import type { ChipKindConfig } from '../../core/types';
import type { Labels, LandingLabelInput } from '../labels';

/** Settlements this close together are announced as one batch (rapid fire). */
export const BATCH_MS = 400;

export interface AnnouncerInput {
  live: HTMLElement;
  labels: Labels;
}

export class Announcer {
  private landed: LandingLabelInput[] = [];
  private missed: ChipKindConfig<unknown>[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flip = false;

  constructor(private readonly input: AnnouncerInput) {}

  say(text: string): void {
    // Alternating a trailing zero-width space makes a repeated message count as a change,
    // so screen readers announce it again.
    this.flip = !this.flip;
    this.input.live.textContent = this.flip ? text : `${text}​`;
  }

  /** Queues a landing; flushed after a short quiet period. */
  landedIn(landing: LandingLabelInput): void {
    this.landed.push(landing);
    this.restartTimer();
  }

  /** Queues a miss; flushed after a short quiet period. */
  missedBy(chip: ChipKindConfig<unknown>): void {
    this.missed.push(chip);
    this.restartTimer();
  }

  /** Announces everything queued: one landing, one miss, or a batch. */
  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const text = this.describeQueued();
    this.landed = [];
    this.missed = [];
    if (text) this.say(text);
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.landed = [];
    this.missed = [];
  }

  private restartTimer(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), BATCH_MS);
  }

  private describeQueued(): string | undefined {
    const { labels } = this.input;
    const [landing] = this.landed;
    const [miss] = this.missed;
    const count = this.landed.length + this.missed.length;
    if (count === 0) return undefined;
    if (count > 1) return labels.settledBatch({ landed: this.landed, missed: this.missed.length });
    if (landing) return labels.landed(landing);
    return miss && labels.missed({ chip: miss });
  }
}

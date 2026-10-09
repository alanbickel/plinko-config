// Screen-reader announcements through the board's own aria-live region.

import type { ChipKindConfig } from '../../core/types';
import type { Labels, LandingLabelInput, OverSlotLabelInput } from '../labels';

/** Settlements this close together are announced as one batch (rapid fire). */
export const BATCH_MS = 400;
/** The held chip must stay put this long before the slot under it is announced. */
export const OVER_MS = 250;

export interface AnnouncerInput {
  live: HTMLElement;
  labels: Labels;
}

export class Announcer {
  private landed: LandingLabelInput[] = [];
  private missed: ChipKindConfig<unknown>[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flip = false;
  private overTimer: ReturnType<typeof setTimeout> | undefined;
  /** Id of the slot last announced under the held chip. */
  private overSaid: string | undefined;

  constructor(private input: AnnouncerInput) {}

  /** New wording for everything said from now on (board.update). */
  setLabels(labels: Labels): void {
    this.input = { ...this.input, labels };
  }

  say(text: string): void {
    // Alternating a trailing zero-width space makes a repeated message count as a change,
    // so screen readers announce it again.
    this.flip = !this.flip;
    this.input.live.textContent = this.flip ? text : `${text}​`;
  }

  /**
   * The held chip moved. Once it stays put for OVER_MS, announces the slot under it, unless that
   * slot was the last one announced.
   */
  overSlot(over: OverSlotLabelInput): void {
    clearTimeout(this.overTimer);
    this.overTimer = setTimeout(() => {
      this.overTimer = undefined;
      if (over.slot.id === this.overSaid) return;
      this.overSaid = over.slot.id;
      this.say(this.input.labels.overSlot(over));
    }, OVER_MS);
  }

  /** A new pickup, or the chip is gone: cancels a pending slot and forgets the last one. */
  resetOver(): void {
    clearTimeout(this.overTimer);
    this.overTimer = undefined;
    this.overSaid = undefined;
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
    this.resetOver();
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

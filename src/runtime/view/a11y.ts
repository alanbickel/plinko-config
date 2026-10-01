// Screen-reader announcements through the board's own aria-live region.

import type { ChipKindConfig, SlotConfig } from '../../core/types';
import type { Labels } from '../labels';

type Chip = ChipKindConfig<unknown>;
type Slot = SlotConfig<unknown>;

/** Settlements this close together are announced as one batch (rapid fire). */
export const BATCH_MS = 400;

export class Announcer {
  private landed: { chip: Chip; slot: Slot }[] = [];
  private missed: Chip[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flip = false;

  constructor(
    private readonly live: HTMLElement,
    private readonly labels: () => Labels,
  ) {}

  say(text: string): void {
    // Alternating a trailing zero-width space makes a repeated message count as a change,
    // so screen readers announce it again.
    this.flip = !this.flip;
    this.live.textContent = this.flip ? text : `${text}​`;
  }

  /** Queues a landing (slot) or miss (no slot); flushed after a short quiet period. */
  settled(chip: Chip, slot: Slot | undefined): void {
    if (slot) this.landed.push({ chip, slot });
    else this.missed.push(chip);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), BATCH_MS);
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const { landed, missed } = this;
    this.landed = [];
    this.missed = [];
    const labels = this.labels();
    const [onlyLanded] = landed;
    const [onlyMissed] = missed;
    if (landed.length + missed.length === 0) return;
    if (landed.length === 1 && missed.length === 0 && onlyLanded) {
      this.say(labels.landed(onlyLanded.chip, onlyLanded.slot));
    } else if (missed.length === 1 && landed.length === 0 && onlyMissed) {
      this.say(labels.missed(onlyMissed));
    } else {
      this.say(labels.settledBatch(landed, missed.length));
    }
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.landed = [];
    this.missed = [];
  }
}

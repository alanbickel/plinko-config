import type { ChipKindConfig, SlotConfig } from '../core/types';

type Chip = ChipKindConfig<unknown>;
type Slot = SlotConfig<unknown>;

/** Every user-facing string. Functions are announcement templates; override any of them. */
export interface Labels {
  /** aria-label of the canvas. */
  board: string;
  /** Read once when the board gets focus (aria-describedby). */
  instructions: string;
  /** Tray selection changed, or the tray zone was entered. */
  selected: (chip: Chip) => string;
  pickedUp: (chip: Chip) => string;
  cancelled: (chip: Chip) => string;
  dropped: (chip: Chip) => string;
  landed: (chip: Chip, slot: Slot) => string;
  missed: (chip: Chip) => string;
  /** Several settled close together (rapid fire), batched into one announcement. */
  settledBatch: (landed: { chip: Chip; slot: Slot }[], missed: number) => string;
  outOfChips: (chip: Chip) => string;
  /** Too many chips in flight. */
  busy: string;
  /** The board is full; shown on the board and announced. */
  locked: string;
  attribution: string;
}

export const DEFAULT_LABELS: Labels = {
  board: 'Plinko preferences board',
  instructions:
    'Left and right arrows choose a chip; Enter picks it up. Then arrows aim, Shift with arrows ' +
    'moves faster, Home and End jump to the edges, Enter drops, Escape puts the chip back.',
  selected: (chip) => `${chip.label} chip.`,
  pickedUp: (chip) =>
    `Picked up ${article(chip.label)} ${chip.label} chip. Arrows to aim, Enter to drop.`,
  cancelled: (chip) => `Put the ${chip.label} chip back.`,
  dropped: () => 'Dropped.',
  landed: (chip, slot) => `${chip.label} chip landed in ${slot.label}.`,
  missed: (chip) => `The ${chip.label} chip didn't make it into a slot.`,
  settledBatch: (landed, missed) => {
    const parts = landed.map(({ chip, slot }) => `${chip.label} in ${slot.label}`);
    if (missed) parts.push(`${missed} missed`);
    return `${landed.length + missed} chips settled: ${parts.join(', ')}.`;
  },
  outOfChips: (chip) => `Out of ${chip.label} chips.`,
  busy: 'Too many chips in the air. Wait a moment.',
  locked: 'Sorry, you can no longer make any changes.',
  attribution: 'Powered by LittleJS',
};

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

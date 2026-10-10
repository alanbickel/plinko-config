import type { ChipKindConfig, SlotConfig } from '../core/types';

/** What a {@link ChipLabel} template receives. */
export interface ChipLabelInput {
  /** The chip kind the message is about. */
  chip: ChipKindConfig<unknown>;
}

/** What the `landed` template receives. */
export interface LandingLabelInput extends ChipLabelInput {
  /** The slot the chip landed in. */
  slot: SlotConfig<unknown>;
}

/** What the `overSlot` template receives. */
export interface OverSlotLabelInput extends ChipLabelInput {
  /** The slot under the held chip. */
  slot: SlotConfig<unknown>;
}

/** What the `selected` and `outOfChips` templates receive: a chip kind and how many are left. */
export interface StockLabelInput extends ChipLabelInput {
  /** Chips left; `Infinity` when unlimited. */
  count: number;
  /** True when none are left and the player can request more (refill mode `'onRequest'`). */
  canRequest: boolean;
}

/** What the `settledBatch` template receives. */
export interface BatchLabelInput {
  /** The chips in the batch that landed, and where. */
  landed: LandingLabelInput[];
  /** How many chips in the batch missed. */
  missed: number;
}

/** A template for an announcement about one chip: it gets the chip kind and returns the text. */
export type ChipLabel = (input: ChipLabelInput) => string;

/**
 * All of the board's text: what it draws, its ARIA attributes, and what it announces to screen
 * readers. Function labels are templates: they get details about the chip (and slot) and return the
 * text. Change any of them with the `labels` option, for wording or translation.
 */
export interface Labels {
  /** The board's accessible name (the canvas's `aria-label`). */
  board: string;
  /** What screen readers call the kind of control the board is (`aria-roledescription`). */
  roleDescription: string;
  /** How to play by keyboard, read when the board gets focus (`aria-describedby`). */
  instructions: string;
  /** Announced when the player chooses another chip kind in the tray with the arrow keys. */
  selected: (input: StockLabelInput) => string;
  /** Announced when a chip is picked up. */
  pickedUp: ChipLabel;
  /** Announced when the held chip is put back in the tray. */
  cancelled: ChipLabel;
  /** Announced when a chip is dropped and starts to fall. */
  dropped: ChipLabel;
  /**
   * Announced instead of `dropped` when `autoReload` picks up another chip of the same kind
   * straight away.
   */
  droppedAndReloaded: ChipLabel;
  /** Announced when the held chip moves into the drop zone. */
  enteredDropZone: string;
  /** Announced when the held chip moves out of the drop zone. */
  leftDropZone: string;
  /**
   * Announced when the held chip stops over a different slot (after a short pause, so moving
   * across several slots says only where it stopped). Also the first move after each pickup.
   */
  overSlot: (input: OverSlotLabelInput) => string;
  /** Announced when a chip is dropped outside the drop zone and is lost. */
  fellOff: ChipLabel;
  /** Announced when a chip lands in a slot. */
  landed: (input: LandingLabelInput) => string;
  /** Announced when a chip comes to rest without reaching a slot. */
  missed: ChipLabel;
  /**
   * Announced instead of separate `landed` and `missed` messages when several chips come to rest
   * close together.
   */
  settledBatch: (input: BatchLabelInput) => string;
  /**
   * Announced when the player tries to pick up a chip of an empty kind, or `autoReload` finds the
   * kind empty.
   */
  outOfChips: (input: StockLabelInput) => string;
  /** Announced when the player asks for more chips, while `onRequest` decides. */
  requesting: ChipLabel;
  /** Announced when a request for more chips is granted. */
  granted: ChipLabel;
  /** Announced when a request for more chips is denied. */
  denied: ChipLabel;
  /** Shown in the tray under an empty kind that can be requested. */
  requestMore: string;
  /** Shown in the tray while `onRequest` decides on a request. */
  requestPending: string;
  /** Announced when a drop is refused because `maxInFlight` chips are already falling. */
  busy: string;
  /** Shown on the board and announced when it locks (see `onFull`). */
  locked: string;
  /** Text of the "Powered by LittleJS" link (see the `attribution` option). */
  attribution: string;
}

/**
 * The built-in English text. Pass only the labels you want to change in `labels`; the rest come
 * from here.
 */
export const DEFAULT_LABELS: Labels = {
  board: 'Plinko board',
  roleDescription: 'game',
  instructions:
    'Left and right arrows choose a chip; Enter picks it up. Up and down arrows carry it, left ' +
    'and right move it across, Shift with arrows moves faster, Home and End jump to the edges. ' +
    'Carry it up into the drop zone, then press Enter to drop it. Escape puts the chip back.',
  selected: (input) => `${input.chip.label} chip${stock(input)}.`,
  pickedUp: ({ chip }) =>
    `Picked up ${article(chip.label)} ${chip.label} chip. Use the arrow keys to move it.`,
  cancelled: ({ chip }) => `Put the ${chip.label} chip back.`,
  dropped: () => 'Chip dropped.',
  droppedAndReloaded: ({ chip }) => `Chip dropped. Another ${chip.label} chip has been picked up.`,
  enteredDropZone: 'Over the drop zone. Release or press Enter to drop.',
  leftDropZone: 'Left the drop zone.',
  overSlot: ({ slot }) => `Over ${slot.label}.`,
  fellOff: ({ chip }) => `The ${chip.label} chip fell off the board.`,
  landed: ({ chip, slot }) => `${chip.label} chip landed in ${slot.label}.`,
  missed: ({ chip }) => `The ${chip.label} chip didn't make it into a slot.`,
  settledBatch: ({ landed, missed }) => {
    const parts = landed.map(({ chip, slot }) => `${chip.label} in ${slot.label}`);
    if (missed) parts.push(`${missed} missed`);
    return `${landed.length + missed} chips settled: ${parts.join(', ')}.`;
  },
  outOfChips: ({ chip, canRequest }) => `Out of ${chip.label} chips.${requestHint(canRequest)}`,
  requesting: ({ chip }) => `Requesting more ${chip.label} chips…`,
  granted: ({ chip }) => `Request granted: more ${chip.label} chips.`,
  denied: ({ chip }) => `Request for more ${chip.label} chips was denied.`,
  requestMore: 'Enter: request more',
  requestPending: 'Requesting…',
  busy: 'Too many chips in the air. Wait a moment.',
  locked: 'You can no longer play.',
  attribution: 'Powered by LittleJS',
};

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

const requestHint = (canRequest: boolean) => (canRequest ? ' Press Enter to request more.' : '');

/** ", 3 left" / ", none left" (plus how to get more) / nothing when unlimited. */
function stock({ count, canRequest }: StockLabelInput): string {
  if (count === Infinity) return '';
  if (count > 0) return `, ${count} left`;
  return canRequest ? ', none left. Press Enter to request more' : ', none left';
}

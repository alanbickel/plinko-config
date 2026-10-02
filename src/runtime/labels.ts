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

/** A kind and how many are left. */
export interface StockLabelInput extends ChipLabelInput {
  /** Chips left; Infinity when unlimited. */
  count: number;
  /** Empty, and more can be requested. */
  canRequest: boolean;
}

/** What the `settledBatch` template receives. */
export interface BatchLabelInput {
  /** The chips in the batch that landed, and where. */
  landed: LandingLabelInput[];
  /** How many chips in the batch missed. */
  missed: number;
}

/** A template for announcements about one chip. */
export type ChipLabel = (input: ChipLabelInput) => string;

/** Every user-facing string. Functions are announcement templates; override any of them. */
export interface Labels {
  /** aria-label of the canvas. */
  board: string;
  /** Read once when the board gets focus (aria-describedby). */
  instructions: string;
  /** Tray selection changed, or the tray zone was entered. */
  selected: (input: StockLabelInput) => string;
  /** A chip was picked up. */
  pickedUp: ChipLabel;
  /** The held chip was put back in the tray. */
  cancelled: ChipLabel;
  /** A chip was dropped in the drop zone and is falling. */
  dropped: ChipLabel;
  /** The held chip was carried into the drop zone. */
  enteredDropZone: string;
  /** The held chip was carried out of the drop zone. */
  leftDropZone: string;
  /** Dropped outside the drop zone: the chip is gone. */
  fellOff: ChipLabel;
  /** A chip landed in a slot. */
  landed: (input: LandingLabelInput) => string;
  /** A chip came to rest without reaching a slot. */
  missed: ChipLabel;
  /** Several settled close together (rapid fire), batched into one announcement. */
  settledBatch: (input: BatchLabelInput) => string;
  /** A kind has none left: the player tried to pick one up, or `autoReload` found it empty. */
  outOfChips: (input: StockLabelInput) => string;
  /** A request for more chips was sent to the host. */
  requesting: ChipLabel;
  /** The host granted a request for more chips. */
  granted: ChipLabel;
  /** The host denied a request for more chips. */
  denied: ChipLabel;
  /** Shown in the tray under an empty kind that can be requested. */
  requestMore: string;
  /** Shown in the tray while a request waits for the host. */
  requestPending: string;
  /** Too many chips in flight. */
  busy: string;
  /** The board is full; shown on the board and announced. */
  locked: string;
  /** Text of the "Powered by LittleJS" link (see the `attribution` option). */
  attribution: string;
}

/**
 * The built-in English text. Pass only the labels you want to change in `labels`; the rest come
 * from here.
 */
export const DEFAULT_LABELS: Labels = {
  board: 'Plinko preferences board',
  instructions:
    'Left and right arrows choose a chip; Enter picks it up. Up and down arrows carry it, left ' +
    'and right move it across, Shift with arrows moves faster, Home and End jump to the edges. ' +
    'Enter drops, Escape puts the chip back.',
  selected: (input) => `${input.chip.label} chip${stock(input)}.`,
  pickedUp: ({ chip }) =>
    `Picked up ${article(chip.label)} ${chip.label} chip. Up arrow carries it to the top.`,
  cancelled: ({ chip }) => `Put the ${chip.label} chip back.`,
  dropped: () => 'Dropped.',
  enteredDropZone: 'Over the drop zone. Release or press Enter to drop.',
  leftDropZone: 'Left the drop zone.',
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
  locked: 'Sorry, you can no longer make any changes.',
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

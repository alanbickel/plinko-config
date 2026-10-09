// The playground's `labels` editor: which labels it offers, and how a one-line template with
// {chip}, {slot} and {count} becomes a label function (live) or an arrow function (Export).

import {
  type ChipKindConfig,
  DEFAULT_LABELS,
  type Labels,
  type LandingLabelInput,
  type SlotConfig,
  type StockLabelInput,
} from 'plinko-config';

/** settledBatch is left out: its input is a list, which a one-line template can't express. */
export type LabelKey = Exclude<keyof Labels, 'settledBatch'>;

type Token = 'chip' | 'slot' | 'count';

export interface LabelSpec {
  key: LabelKey;
  /** What it's for, shown in brackets after the name. */
  hint: string;
  /** The placeholders the label's template can use; none for plain text. */
  tokens: Token[];
}

/** Your text, per label; missing or empty keeps the default. */
export type LabelDrafts = Partial<Record<LabelKey, string>>;

const chip: Token[] = ['chip'];

/** What the live region says, so the Screen reader pane shows it. */
export const ANNOUNCED: LabelSpec[] = [
  {
    key: 'selected',
    hint: 'tray selection changed; {count} is chips left',
    tokens: ['chip', 'count'],
  },
  { key: 'pickedUp', hint: 'a chip was picked up', tokens: chip },
  { key: 'cancelled', hint: 'the chip went back to the tray', tokens: chip },
  { key: 'enteredDropZone', hint: 'carried into the drop zone', tokens: [] },
  { key: 'leftDropZone', hint: 'carried out of the drop zone', tokens: [] },
  { key: 'overSlot', hint: 'the held chip stopped over another slot', tokens: ['chip', 'slot'] },
  { key: 'dropped', hint: 'dropped and falling', tokens: chip },
  { key: 'fellOff', hint: 'dropped outside the drop zone', tokens: chip },
  { key: 'landed', hint: 'landed in a slot', tokens: ['chip', 'slot'] },
  { key: 'missed', hint: "didn't reach a slot", tokens: chip },
  {
    key: 'outOfChips',
    hint: 'none of this kind left; {count} is chips left',
    tokens: ['chip', 'count'],
  },
  { key: 'requesting', hint: 'asked the host for more', tokens: chip },
  { key: 'granted', hint: 'the host gave more', tokens: chip },
  { key: 'denied', hint: 'the host said no', tokens: chip },
  { key: 'busy', hint: 'too many chips in the air', tokens: [] },
  { key: 'locked', hint: 'the board is full; also shown on it', tokens: [] },
];

/** Text on the canvas, in the tray, and in ARIA attributes. */
export const BOARD_TEXT: LabelSpec[] = [
  { key: 'board', hint: "the canvas's aria-label", tokens: [] },
  { key: 'roleDescription', hint: 'what screen readers call the board', tokens: [] },
  { key: 'instructions', hint: 'read once when the board gets focus', tokens: [] },
  { key: 'requestMore', hint: 'in the tray under an empty kind', tokens: [] },
  { key: 'requestPending', hint: 'in the tray while a request waits', tokens: [] },
  { key: 'attribution', hint: 'the "Powered by LittleJS" link', tokens: [] },
];

const SPECS = [...ANNOUNCED, ...BOARD_TEXT];
const TOKEN = /\{(chip|slot|count)\}/g;

/** Everything a template's tokens can read from. */
type Input = Partial<LandingLabelInput & StockLabelInput>;

const values: Record<Token, (input: Input) => string> = {
  chip: (input) => input.chip?.label ?? '',
  slot: (input) => input.slot?.label ?? '',
  count: (input) => String(input.count),
};

/** Replaces each token `by` has a value for; any other {word} stays as typed. */
function replaceTokens(text: string, by: (token: Token) => string | undefined): string {
  return text.replace(TOKEN, (match, token: Token) => by(token) ?? match);
}

/** The default, written as a template: the default function given the tokens as labels. */
export function defaultText(spec: LabelSpec): string {
  const label = DEFAULT_LABELS[spec.key];
  if (typeof label === 'string') return label;
  const sample = {
    chip: { id: 'chip', label: '{chip}' } as ChipKindConfig<unknown>,
    slot: { id: 'slot', label: '{slot}' } as SlotConfig<unknown>,
    count: Infinity,
    canRequest: false,
  };
  return label(sample);
}

/** The drafts that are set, with their spec. */
function edited(drafts: LabelDrafts): { spec: LabelSpec; text: string }[] {
  return SPECS.flatMap((spec) => {
    const text = drafts[spec.key];
    return text ? [{ spec, text }] : [];
  });
}

/** The drafts as the `labels` option. */
export function labelsOption(drafts: LabelDrafts): Partial<Labels> {
  const entries = edited(drafts).map(({ spec, text }) => [
    spec.key,
    spec.tokens.length
      ? (input: Input) =>
          replaceTokens(text, (t) => (spec.tokens.includes(t) ? values[t](input) : undefined))
      : text,
  ]);
  return Object.fromEntries(entries);
}

const EXPRESSIONS: Record<Token, string> = {
  chip: 'chip.label',
  slot: 'slot.label',
  count: 'count',
};

/** A template as an arrow function's source, destructuring only the inputs it uses. */
function arrowSource(text: string, spec: LabelSpec): string {
  const used = spec.tokens.filter((token) => text.includes(`{${token}}`));
  if (!used.length) return `() => '${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const escaped = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const body = replaceTokens(escaped, (t) =>
    used.includes(t) ? `\${${EXPRESSIONS[t]}}` : undefined,
  );
  return `({ ${used.join(', ')} }) => \`${body}\``;
}

export interface LabelSource {
  key: LabelKey;
  /** The text, or for a template, its arrow function's source. */
  value: string;
  isCode: boolean;
}

/** For Export: plain text as strings, templates as arrow-function source. */
export function labelsSource(drafts: LabelDrafts): LabelSource[] {
  return edited(drafts).map(({ spec, text }) => {
    const isCode = spec.tokens.length > 0;
    return { key: spec.key, value: isCode ? arrowSource(text, spec) : text, isCode };
  });
}

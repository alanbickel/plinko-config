// Slider definitions for the playground's control groups. Ranges match the library's validation.

import type { SlotLabelLayout } from 'plinko-config';
import type { ControlsDraft, PlaygroundConfig } from './config';

export interface SliderSpec<K extends string> {
  key: K;
  label: string;
  min: number;
  max: number;
  step: number;
  /** One line for people who don't know the option. */
  hint: string;
}

type PhysicsKey = Exclude<keyof PlaygroundConfig['physics'], 'chipCollisions'>;
type BoardKey = keyof PlaygroundConfig['board'];
type StepKey = 'aimStep' | 'aimStepLarge' | 'liftStep' | 'liftStepLarge';

export const PHYSICS_SLIDERS: SliderSpec<PhysicsKey>[] = [
  { key: 'gravity', label: 'Gravity', min: 5, max: 120, step: 1, hint: 'How fast chips fall.' },
  {
    key: 'restitution',
    label: 'Bounce',
    min: 0,
    max: 1,
    step: 0.01,
    hint: '0 = thud, 1 = superball.',
  },
  {
    key: 'friction',
    label: 'Friction',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'Speed lost sliding past a peg.',
  },
  {
    key: 'jitter',
    label: 'Chaos',
    min: 0,
    max: 3,
    step: 0.05,
    hint: 'Random sideways kick per peg.',
  },
  { key: 'maxSpeed', label: 'Max speed', min: 2, max: 30, step: 0.5, hint: 'Speed cap.' },
];

export const BOARD_SLIDERS: SliderSpec<BoardKey>[] = [
  {
    key: 'rows',
    label: 'Peg rows',
    min: 1,
    max: 20,
    step: 1,
    hint: 'Taller boards, longer falls.',
  },
  { key: 'pegRadius', label: 'Peg size', min: 0.02, max: 0.2, step: 0.01, hint: 'Peg radius.' },
  {
    key: 'chipRadius',
    label: 'Chip size',
    min: 0.1,
    max: 0.45,
    step: 0.01,
    hint: 'Must fit between pegs.',
  },
  {
    key: 'slotHeight',
    label: 'Slot height',
    min: 0.8,
    max: 5,
    step: 0.1,
    hint: 'Room for the piles.',
  },
  {
    key: 'railWidth',
    label: 'Rail width',
    min: 0.02,
    max: 0.45,
    step: 0.01,
    hint: 'Walls between slots.',
  },
];

export const STEP_SLIDERS: SliderSpec<StepKey>[] = [
  {
    key: 'aimStep',
    label: '← / → step',
    min: 0.01,
    max: 1,
    step: 0.01,
    hint: 'Fraction of the width.',
  },
  {
    key: 'aimStepLarge',
    label: 'Shift ← / →',
    min: 0.01,
    max: 1,
    step: 0.01,
    hint: 'Fraction of the width.',
  },
  {
    key: 'liftStep',
    label: '↑ / ↓ step',
    min: 0.01,
    max: 1,
    step: 0.01,
    hint: 'Fraction of the carry.',
  },
  {
    key: 'liftStepLarge',
    label: 'Shift ↑ / ↓',
    min: 0.01,
    max: 1,
    step: 0.01,
    hint: 'Fraction of the carry.',
  },
];

export type MotionChoice = ControlsDraft['motion'];
export const MOTION_CHOICES: MotionChoice[] = ['auto', 'full', 'reduced'];

export interface LabelLayoutChoice {
  value: SlotLabelLayout;
  label: string;
}

export const LABEL_LAYOUTS: LabelLayoutChoice[] = [
  { value: 'vertical', label: 'Vertical (default)' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'angled', label: 'Angled' },
  { value: 'backboard', label: 'On the backboard' },
];

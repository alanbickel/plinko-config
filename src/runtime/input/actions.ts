// What input asks the board to do. Keyboard and pointer both produce these, so they behave the same.

/** Tray: choosing a kind (nothing held). Board: carrying and dropping (a chip held). */
export type Zone = 'tray' | 'board';

export interface SelectAction {
  type: 'select';
  index: number;
}
export interface PickUpAction {
  type: 'pickUp';
  index: number;
}
export interface NudgeAction {
  type: 'nudge';
  dx: number;
}
export interface AimAction {
  type: 'aim';
  x: number;
}
/** Carry the held chip up (positive) or down, as a fraction of the carry path. */
export interface LiftAction {
  type: 'lift';
  dy: number;
}
/** Move the held chip to a spot: where a drag has it. */
export interface CarryAction {
  type: 'carry';
  x: number;
  lift: number;
}
/** Drop from the drop zone; anywhere else the chip is lost. */
export interface DropAction {
  type: 'drop';
  /** Pick up the next chip straight away (with autoReload). Keyboard yes, pointer no. */
  reload: boolean;
}
/** The held chip falls off the board, wherever it is. */
export interface LoseAction {
  type: 'lose';
}
export interface CancelAction {
  type: 'cancel';
}

/** Every input action, keyed by its type. */
export interface InputActionByType {
  select: SelectAction;
  pickUp: PickUpAction;
  nudge: NudgeAction;
  aim: AimAction;
  lift: LiftAction;
  carry: CarryAction;
  drop: DropAction;
  lose: LoseAction;
  cancel: CancelAction;
}

export type InputAction = InputActionByType[keyof InputActionByType];

/**
 * The `<plinko-board>` custom element. Importing this module registers it; that is the package's
 * only side effect. To register under another tag name, call {@link definePlinkoBoard}.
 *
 * @module plinko-config/element
 */

import { definePlinkoBoard } from './runtime/element';

export {
  definePlinkoBoard,
  PlinkoBoardElement,
  type PlinkoBoardEventMap,
} from './runtime/element';

definePlinkoBoard();

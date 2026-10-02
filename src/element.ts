// plinko-config/element: registers <plinko-board> on import (the package's only side effect).

import { definePlinkoBoard } from './runtime/element';

export {
  definePlinkoBoard,
  PlinkoBoardElement,
  type PlinkoBoardEventMap,
} from './runtime/element';

definePlinkoBoard();

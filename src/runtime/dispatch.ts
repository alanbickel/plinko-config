// Typed handler maps (CONTRIBUTING.md rule 4): one handler per message type, checked by the
// compiler, instead of switch statements.

/** Anything with a `type` tag. */
export interface Tagged<K> {
  type: K;
}

/** One handler per type in a "by type" interface; leaving one out is a compile error. */
export type HandlerMap<M> = { [K in keyof M]: (message: M[K]) => void };

/** Calls the handler registered for this message's type. */
export function dispatchByType<M>(
  handlers: HandlerMap<M>,
  message: M[keyof M] & Tagged<keyof M>,
): void {
  // Sound: the map is keyed by type, so this handler accepts exactly this message.
  const handler = handlers[message.type] as (message: M[keyof M]) => void;
  handler(message);
}

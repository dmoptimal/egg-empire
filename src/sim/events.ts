import type { SimEvent, SimState } from "./types";

export function emit(state: SimState, ev: SimEvent): void {
  state.events.push(ev);
}

/** Return all buffered events and clear the buffer. Hosts drain once per frame. */
export function drainEvents(state: SimState): SimEvent[] {
  const evs = state.events;
  state.events = [];
  return evs;
}

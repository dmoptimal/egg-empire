// Lifetime stat counters (Dan 2026-07-05: a stats screen in settings).
// Plain numbers on state.stats, persisted in the save; the settings UI
// formats them. One helper so call sites stay one-liners.

import type { SimState } from "./types";

export function bump(state: SimState, key: string, n = 1): void {
  state.stats[key] = (state.stats[key] ?? 0) + n;
}

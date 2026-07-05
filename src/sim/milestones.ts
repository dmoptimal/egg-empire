// One-shot progress toasts: delivery counts and "meet the bird" gimmick
// intros. Fired ids persist in the save (state.milestones) so nothing ever
// toasts twice, and at most one fires per MS_TOAST_GAP so a restored old
// save doesn't stack five toasts on one frame.

import { emit } from "./events";
import type { SimState } from "./types";

export const DELIVERED_STEPS = [100, 1000, 10000, 100000, 1000000];
const MS_TOAST_GAP = 4;

/** Fire a one-shot milestone immediately (event-driven callers, e.g. foxes). */
export function fireMilestone(state: SimState, id: string): boolean {
  if (state.milestones[id]) return false;
  state.milestones[id] = 1;
  state.msCd = MS_TOAST_GAP;
  emit(state, { type: "milestone", id });
  return true;
}
const fire = fireMilestone;

/** Called once per tick, after the trucks have paid out. */
export function updateMilestones(state: SimState, dt: number): void {
  if (state.msCd > 0) {
    state.msCd -= dt;
    return;
  }
  for (const n of DELIVERED_STEPS)
    if (state.totalDelivered >= n && fire(state, `delivered_${n}`)) return;
  if (state.counts[2] > 0 && fire(state, "quail_intro")) return;
  if (state.counts[3] > 0 && fire(state, "goose_intro")) return;
  if (state.counts[4] > 0 && fire(state, "ostrich_intro")) return;
  if (state.clock.night && fire(state, "night_intro")) return;
}

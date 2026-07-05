// One sim step, in the prototype's exact frame order: warning cooldown →
// lay accumulation → held-pointer vacuum → falling → ground aging → flight →
// collectors → trucks. The render loop calls this once per frame with
// dt = min(deltaMS, 100) / 1000 (variable-rate render, accumulator laying);
// headless tests call it with fixed small steps.

import { LAY_ACC_MAX, LAY_BURST_MAX } from "../config/constants";
import { RUSH_INTERVAL_MIN, RUSH_INTERVAL_VAR, RUSH_LAY_MULT } from "../config/economy";
import { QUAIL_CLUSTER_PCT, QUAIL_CLUSTER_SIZE, SPECIES } from "../config/species";
import { updateTruck } from "./baskets";
import { sweepCollect } from "./collect";
import { updateCollector } from "./collectors";
import { layIntv, lvl, unlocked } from "./economy";
import { layEgg, layRushEgg, updateFalling, updateFlying, updateGround } from "./eggs";
import { emit } from "./events";
import { updateKitchen } from "./kitchen";
import { updateMilestones } from "./milestones";
import { updateCasino } from "./casino";
import { updateClock, updateFoxes } from "./night";
import { DEFAULT_HOOKS } from "./state";
import type { SimHooks, SimState } from "./types";

export interface HeldPointer {
  x: number;
  y: number;
}

export function tick(
  state: SimState,
  dt: number,
  hooks: SimHooks = DEFAULT_HOOKS,
  /** Fingers currently held down — each vacuums around its position. */
  held?: readonly HeldPointer[],
): void {
  if (state.fullWarnCd > 0) state.fullWarnCd -= dt;
  state.comboT = Math.min(state.comboT + dt, 999);
  updateClock(state, dt);
  const night = state.clock.night;

  // Golden Rush: shimmer eggs drop on a randomised cadence once unlocked;
  // sweeping one sets rush.active (see collect.ts). The cadence holds its
  // breath at night — a shimmer egg under a roosting flock would be wasted.
  if (state.rush.active > 0) {
    state.rush.active -= dt;
    if (state.rush.active <= 0) {
      state.rush.active = 0;
      emit(state, { type: "rush-ended" });
    }
  }
  if (!night && lvl(state, "rush") >= 1) {
    if (state.rush.next <= 0) state.rush.next = RUSH_INTERVAL_MIN + hooks.rng() * RUSH_INTERVAL_VAR;
    state.rush.next -= dt;
    if (state.rush.next <= 0) {
      layRushEgg(state, hooks);
      state.rush.next = RUSH_INTERVAL_MIN + hooks.rng() * RUSH_INTERVAL_VAR;
    }
  }
  const layMult = state.rush.active > 0 ? RUSH_LAY_MULT : 1;

  // Fixed-accumulator laying: fractional eggs-owed build up per species and
  // are laid in bursts of at most LAY_BURST_MAX per frame. Roosting birds
  // lay nothing — night income is fox bounties (and the kitchen).
  if (!night)
    for (let i = 0; i < SPECIES.length; i++) {
      if (!unlocked(state, i) || state.counts[i] === 0) continue;
      state.layAcc[i] += (dt * state.counts[i] * layMult) / layIntv(state, i);
      let n = Math.min(Math.floor(state.layAcc[i]), LAY_BURST_MAX);
      while (n-- > 0) {
        const laid = layEgg(state, i, hooks);
        state.layAcc[i]--;
        // Quail gimmick: sometimes a lay is a whole burst, landing together —
        // one sweep grabs the lot, which is what hot streaks are made of.
        if (laid && i === 2 && hooks.rng() < QUAIL_CLUSTER_PCT)
          for (let c = 1; c < QUAIL_CLUSTER_SIZE; c++) layEgg(state, i, hooks, laid);
      }
      state.layAcc[i] = Math.min(state.layAcc[i], LAY_ACC_MAX);
    }

  if (held) for (const p of held) sweepCollect(state, p.x, p.y, p.x, p.y);

  updateFalling(state, dt);
  updateGround(state, dt);
  updateFlying(state, dt);
  for (const c of state.collectors) updateCollector(state, c, dt);
  for (const b of state.baskets) updateTruck(state, b, dt);
  updateFoxes(state, dt, hooks.rng);
  updateKitchen(state, dt, hooks.rng); // both sims always run (no-op until unlocked)
  updateCasino(state, dt, hooks.rng);
  updateMilestones(state, dt);
}

// One sim step, in the prototype's exact frame order: warning cooldown →
// lay accumulation → held-pointer vacuum → falling → ground aging → flight →
// collectors → trucks. The render loop calls this once per frame with
// dt = min(deltaMS, 100) / 1000 (variable-rate render, accumulator laying);
// headless tests call it with fixed small steps.

import { LAY_ACC_MAX, LAY_BURST_MAX } from "../config/constants";
import { SPECIES } from "../config/species";
import { updateTruck } from "./baskets";
import { sweepCollect } from "./collect";
import { updateCollector } from "./collectors";
import { layIntv, unlocked } from "./economy";
import { layEgg, updateFalling, updateFlying, updateGround } from "./eggs";
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

  // Fixed-accumulator laying: fractional eggs-owed build up per species and
  // are laid in bursts of at most LAY_BURST_MAX per frame.
  for (let i = 0; i < SPECIES.length; i++) {
    if (!unlocked(state, i) || state.counts[i] === 0) continue;
    state.layAcc[i] += (dt * state.counts[i]) / layIntv(state, i);
    let n = Math.min(Math.floor(state.layAcc[i]), LAY_BURST_MAX);
    while (n-- > 0) {
      layEgg(state, i, hooks);
      state.layAcc[i]--;
    }
    state.layAcc[i] = Math.min(state.layAcc[i], LAY_ACC_MAX);
  }

  if (held) for (const p of held) sweepCollect(state, p.x, p.y, p.x, p.y);

  updateFalling(state, dt);
  updateGround(state, dt);
  updateFlying(state, dt);
  for (const c of state.collectors) updateCollector(state, c, dt);
  for (const b of state.baskets) updateTruck(state, b, dt);
}

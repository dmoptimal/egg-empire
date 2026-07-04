// Pacing model (PLAN.md Phase 0): steady-state income rates for a state, and
// checkpoint → sim materialization. Shared by the pacing tests (the balance
// spec) and the ?dev=1 admin panel's era-jump presets — one source, no drift.

import { GOLDEN_VALUE_MULT } from "../config/constants";
import type { Checkpoint } from "../config/economy";
import { SPECIES } from "../config/species";
import {
  featherGolden,
  featherPerEgg,
  goldenPct,
  layIntv,
  unlocked,
  worthMult,
} from "./economy";
import { restore, SAVE_VERSION, type SaveData } from "./save";
import type { SimState } from "./types";

/** A checkpoint expressed as save data (the era-jump presets reuse restore). */
export function checkpointToSave(cp: Checkpoint): SaveData {
  return {
    v: SAVE_VERSION,
    money: cp.money,
    feathers: cp.feathers,
    totalDelivered: 0,
    counts: [...cp.counts],
    n: { ...cp.n },
    won: false,
    lastSeen: 0,
  };
}

/** Materialize a checkpoint as a live sim (baskets/collectors included). */
export function checkpointSim(cp: Checkpoint): SimState {
  const state = restore(checkpointToSave(cp));
  if (!state) throw new Error(`Checkpoint ${cp.id} does not restore`);
  return state;
}

/**
 * Steady-state money per second, assuming every laid egg gets collected and
 * delivered at live pricing (worth rounds before the golden ×10). Collector
 * bonuses are deliberately excluded — this is the neutral era income the
 * pacing bands are judged against.
 */
export function moneyRate(state: SimState): number {
  let rate = 0;
  for (let i = 0; i < SPECIES.length; i++) {
    if (!unlocked(state, i) || state.counts[i] === 0) continue;
    const eggsPerSec = state.counts[i] / layIntv(state, i);
    const base = Math.round(SPECIES[i].eggValue * worthMult(state, i));
    const g = goldenPct(state, i);
    rate += eggsPerSec * (base * (1 - g) + base * GOLDEN_VALUE_MULT * g);
  }
  return rate;
}

/** Steady-state feathers per second under the same assumptions. */
export function featherRate(state: SimState): number {
  let rate = 0;
  for (let i = 0; i < SPECIES.length; i++) {
    if (!unlocked(state, i) || state.counts[i] === 0) continue;
    const eggsPerSec = state.counts[i] / layIntv(state, i);
    const g = goldenPct(state, i);
    rate += eggsPerSec * (featherPerEgg(state, i) * (1 - g) + featherGolden(state, i) * g);
  }
  return rate;
}

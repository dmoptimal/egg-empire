// Derived economy values — direct ports of the prototype's one-liners
// (birdCost, worthMult, layIntv, …). All read the state + config tables;
// no magic numbers here (they live in src/config/).

import {
  BASKET_CAP_PER_LVL,
  COLL_BAG_BASE,
  COLL_SPEED_BASE,
  COLL_SPEED_GROWTH,
  COLL_VALUE_PER_LVL,
  GOLDEN_BASE,
  GOLDEN_PER_LVL,
  LAY_SPEED_FACTOR,
  TRUCK_PAUSE_BASE,
  TRUCK_PAUSE_FACTOR,
  TRUCK_SPEED_GROWTH,
  TRUCK_SPEED_IN_BASE,
  TRUCK_SPEED_OUT_BASE,
} from "../config/constants";
import { FEATHER_GOLDEN_MULT, FEATHERS_BY_TIER, WORTH_PER_LVL } from "../config/economy";
import { BASKET_BASE_CAP, SPECIES, TRUCK_SCHEDULE } from "../config/species";
import type { SimState } from "./types";

export const lvl = (s: SimState, id: string): number => s.n[id] ?? 0;

export const unlocked = (s: SimState, i: number): boolean => lvl(s, `sp${i}`) > 0;

/** Cost of the next bird. Chickens start at 2 owned, so the 3rd is base price. */
export const birdCost = (s: SimState, i: number): number =>
  Math.floor(SPECIES[i].birdBase * Math.pow(SPECIES[i].growth, s.counts[i] - (i === 0 ? 2 : 1)));

export const worthMult = (s: SimState, i: number): number =>
  Math.pow(WORTH_PER_LVL, lvl(s, `w${i}`));

export const layIntv = (s: SimState, i: number): number =>
  SPECIES[i].interval * Math.pow(LAY_SPEED_FACTOR, lvl(s, `s${i}`));

export const goldenPct = (s: SimState, i: number): number =>
  GOLDEN_BASE + GOLDEN_PER_LVL * lvl(s, `g${i}`);

export const basketCap = (s: SimState): number =>
  BASKET_BASE_CAP + BASKET_CAP_PER_LVL * lvl(s, "bsize");

export const truckSpeedIn = (s: SimState): number =>
  TRUCK_SPEED_IN_BASE * Math.pow(TRUCK_SPEED_GROWTH, lvl(s, "tspd"));

export const truckSpeedOut = (s: SimState): number =>
  TRUCK_SPEED_OUT_BASE * Math.pow(TRUCK_SPEED_GROWTH, lvl(s, "tspd"));

export const truckPause = (s: SimState): number =>
  TRUCK_PAUSE_BASE * Math.pow(TRUCK_PAUSE_FACTOR, lvl(s, "tspd"));

/** Seconds before a part-full basket is collected; 0 = schedule not unlocked. */
export const truckSchedule = (s: SimState): number => TRUCK_SCHEDULE[lvl(s, "ttime")];

export const collSpeed = (s: SimState): number =>
  COLL_SPEED_BASE * Math.pow(COLL_SPEED_GROWTH, lvl(s, "cspd"));

export const collBagCap = (s: SimState): number => COLL_BAG_BASE + lvl(s, "cbag");

export const collValueMult = (s: SimState): number =>
  1 + COLL_VALUE_PER_LVL * lvl(s, "cval");

/** Feathers per delivered egg: tier base × the Feathered Eggs multiplier. */
export const featherPerEgg = (s: SimState, species: number): number =>
  FEATHERS_BY_TIER[species] * (1 + lvl(s, "fth"));

/** Golden eggs pay ×15 the tier base, same Feathered Eggs multiplier. */
export const featherGolden = (s: SimState, species: number): number =>
  FEATHER_GOLDEN_MULT * FEATHERS_BY_TIER[species] * (1 + lvl(s, "fth"));

export const totalBirds = (s: SimState): number => s.counts.reduce((a, b) => a + b, 0);

// The Kitchen sim (PLAN.md Phase 4) — headless, like everything in src/sim.
// Farm trucks route their egg loads into the pantry (see baskets.ts); hired
// chefs each work one pan, pulling eggs FIFO from the pantry and plating
// dishes onto the counter; a separate kitchen truck collects the counter
// when full or on the shared truck-schedule tech. Both sims always run.

import {
  TRUCK_DISPATCH_X,
  TRUCK_EXIT_MARGIN,
  TRUCK_START_X,
  TRUCK_STOP_OFFSET,
  BASKET_X_FROM_RIGHT,
} from "../config/constants";
import {
  CHEF_COSTS,
  CHEFS2_SLOTS_PER_LVL,
  CKSPD_FACTOR,
  CKVAL_PER_LVL,
  COUNTER_BASE_CAP,
  COUNTER_CAP_PER_LVL,
  PANTRY_BASE_CAP,
  PANTRY_CAP_PER_LVL,
  STATIONS,
} from "../config/kitchen";
import {
  featherGolden,
  featherPerEgg,
  lvl,
  truckPause,
  truckSchedule,
  truckSpeedIn,
  truckSpeedOut,
} from "./economy";
import { emit } from "./events";
import type { BagEgg, CookJob, SimState } from "./types";

export const kitchenUnlocked = (s: SimState): boolean => lvl(s, "kitchen") >= 1;

export const stationUnlocked = (s: SimState, station: number): boolean =>
  lvl(s, STATIONS[station].id) >= 1;

export const pantryCap = (s: SimState): number =>
  PANTRY_BASE_CAP + PANTRY_CAP_PER_LVL * lvl(s, "pantry");

export const counterCap = (s: SimState): number =>
  COUNTER_BASE_CAP + COUNTER_CAP_PER_LVL * lvl(s, "counter");

export const chefSlots = (s: SimState, station: number): number =>
  STATIONS[station].chefSlots + CHEFS2_SLOTS_PER_LVL * lvl(s, "chefs2");

export const cookTime = (s: SimState, station: number): number =>
  STATIONS[station].cookTime * Math.pow(CKSPD_FACTOR, lvl(s, "ckspd"));

export const dishValueMult = (s: SimState, station: number): number =>
  STATIONS[station].valueMult * (1 + CKVAL_PER_LVL * lvl(s, "ckval"));

export const chefCost = (s: SimState, station: number): number =>
  Math.floor(CHEF_COSTS[station].base * Math.pow(CHEF_COSTS[station].growth, s.kitchen.chefs[station]));

/**
 * Take as many eggs as fit from the front of `load` into the pantry.
 * Returns how many were routed; does NOT mutate `load` (the caller owns it).
 */
export function routeToPantry(state: SimState, load: readonly BagEgg[]): number {
  if (!kitchenUnlocked(state)) return 0;
  const space = pantryCap(state) - state.kitchen.pantry.length;
  const routed = Math.max(0, Math.min(space, load.length));
  for (let i = 0; i < routed; i++) {
    const egg = load[i];
    state.kitchen.pantry.push({ value: egg.value, golden: egg.golden, species: egg.species });
  }
  return routed;
}

/** Hire one chef at a station. Guards mirror the tree-buy rules. */
export function hireChef(state: SimState, station: number): boolean {
  if (!kitchenUnlocked(state) || !stationUnlocked(state, station)) return false;
  if (state.kitchen.chefs[station] >= chefSlots(state, station)) return false;
  const cost = chefCost(state, station);
  if (state.money < cost) return false;
  state.money -= cost;
  state.kitchen.chefs[station]++;
  emit(state, { type: "chef-hired", station, count: state.kitchen.chefs[station] });
  return true;
}

function startCooks(state: SimState): void {
  const k = state.kitchen;
  // Reserve counter space for everything already cooking so a finished dish
  // always has a slot — chefs idle rather than dropping food on the floor.
  let capacity = counterCap(state) - k.counter.length - k.cooking.length;
  for (let si = 0; si < STATIONS.length; si++) {
    if (!stationUnlocked(state, si) || k.chefs[si] === 0) continue;
    let active = 0;
    for (const job of k.cooking) if (job.station === si) active++;
    while (active < k.chefs[si] && capacity > 0 && k.pantry.length >= STATIONS[si].eggsIn) {
      let value = 0;
      let feathers = 0;
      let golden = false;
      for (let e = 0; e < STATIONS[si].eggsIn; e++) {
        const egg = k.pantry.shift()!;
        value += egg.value;
        feathers += egg.golden
          ? featherGolden(state, egg.species)
          : featherPerEgg(state, egg.species);
        golden = golden || egg.golden;
      }
      const job: CookJob = {
        station: si,
        t: cookTime(state, si),
        value: Math.round(value * dishValueMult(state, si)),
        feathers,
        golden,
      };
      k.cooking.push(job);
      active++;
      capacity--;
    }
  }
}

function updateKitchenTruck(state: SimState, dt: number): void {
  const k = state.kitchen;
  const t = k.truck;
  const stopX = state.layout.w - BASKET_X_FROM_RIGHT - TRUCK_STOP_OFFSET;
  if (t.truckState === "idle") {
    const schedOn = lvl(state, "ttime") > 0; // shared truck-schedule tech
    if (k.counter.length > 0) t.sched += dt;
    else t.sched = 0;
    const due =
      k.counter.length >= counterCap(state) ||
      (schedOn && k.counter.length > 0 && t.sched >= truckSchedule(state));
    if (due) {
      t.truckState = "in";
      t.truckX = TRUCK_DISPATCH_X;
      t.sched = 0;
      emit(state, { type: "kitchen-truck-dispatched" });
    }
    return;
  }
  if (t.truckState === "in") {
    t.truckX += truckSpeedIn(state) * dt;
    if (t.truckX >= stopX) {
      t.truckState = "load";
      t.truckPause = truckPause(state);
    }
  } else if (t.truckState === "load") {
    t.truckPause -= dt;
    if (t.truckPause <= 0) {
      let money = 0;
      let feathers = 0;
      for (const dish of k.counter) {
        money += dish.value;
        feathers += dish.feathers;
      }
      const dishes = k.counter.length;
      state.money += money;
      state.feathers += feathers;
      state.totalDelivered += dishes;
      k.counter.length = 0;
      t.truckState = "out";
      emit(state, { type: "kitchen-payout", money, feathers, dishes });
    }
  } else if (t.truckState === "out") {
    t.truckX += truckSpeedOut(state) * dt;
    if (t.truckX > state.layout.w + TRUCK_EXIT_MARGIN) {
      t.truckState = "idle";
      t.truckX = TRUCK_START_X;
    }
  }
}

/** One kitchen step — called from tick() after the farm trucks. */
export function updateKitchen(state: SimState, dt: number): void {
  if (!kitchenUnlocked(state)) return;
  const k = state.kitchen;
  startCooks(state);
  for (let i = k.cooking.length - 1; i >= 0; i--) {
    const job = k.cooking[i];
    job.t -= dt;
    if (job.t <= 0) {
      k.cooking.splice(i, 1);
      const dish = { station: job.station, value: job.value, feathers: job.feathers, golden: job.golden };
      k.counter.push(dish);
      emit(state, { type: "dish-cooked", dish });
    }
  }
  updateKitchenTruck(state, dt);
}

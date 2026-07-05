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
  ORDER_FEATHER_MULT,
  ORDER_INTERVAL_MIN,
  ORDER_INTERVAL_VAR,
  ORDER_MAX,
  ORDER_MONEY_MULT,
  ORDER_TTL,
  PANTRY_BASE_CAP,
  PANTRY_CAP_PER_LVL,
  PERFECT_MULT,
  PLATE_WINDOW,
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
import type { BagEgg, CookJob, Order, SimState } from "./types";

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

/** Move a finished job onto the counter, at +50% if it was a Perfect tap. */
function plateJob(state: SimState, job: CookJob, perfect: boolean): void {
  const k = state.kitchen;
  const idx = k.cooking.indexOf(job);
  if (idx >= 0) k.cooking.splice(idx, 1);
  const dish = {
    station: job.station,
    value: perfect ? Math.round(job.value * PERFECT_MULT) : job.value,
    feathers: job.feathers,
    golden: job.golden,
  };
  k.counter.push(dish);
  emit(state, { type: "dish-cooked", dish, perfect, station: job.station });
}

/**
 * Tap a station: plate its most overdue READY dish for the Perfect bonus.
 * Returns false when nothing is sizzling there.
 */
export function plateStation(state: SimState, station: number): boolean {
  if (!kitchenUnlocked(state)) return false;
  let best: CookJob | null = null;
  for (const job of state.kitchen.cooking)
    if (job.station === station && job.t <= 0 && (best === null || job.t < best.t)) best = job;
  if (!best) return false;
  plateJob(state, best, true);
  return true;
}

/** A ready dish sizzles at this station (drives the tap-me visuals). */
export function stationReady(state: SimState, station: number): boolean {
  return state.kitchen.cooking.some((j) => j.station === station && j.t <= 0);
}

/** Whether the counter currently holds everything a ticket needs. */
export function canFillOrder(state: SimState, order: Order): boolean {
  return order.needs.every((qty, st) => {
    if (qty === 0) return true;
    let have = 0;
    for (const d of state.kitchen.counter) if (d.station === st) have++;
    return have >= qty;
  });
}

/**
 * Fulfil a ticket from the counter: consumes the dishes and pays their
 * values ×ORDER_MONEY_MULT (feathers ×ORDER_FEATHER_MULT).
 */
export function fillOrder(state: SimState, orderId: number): boolean {
  const k = state.kitchen;
  const order = k.orders.find((o) => o.id === orderId);
  if (!order || !canFillOrder(state, order)) return false;
  let money = 0;
  let feathers = 0;
  for (let st = 0; st < order.needs.length; st++) {
    let left = order.needs[st];
    for (let i = 0; i < k.counter.length && left > 0; ) {
      if (k.counter[i].station === st) {
        money += k.counter[i].value;
        feathers += k.counter[i].feathers;
        k.counter.splice(i, 1);
        left--;
      } else {
        i++;
      }
    }
  }
  money = Math.round(money * ORDER_MONEY_MULT);
  feathers = Math.round(feathers * ORDER_FEATHER_MULT);
  state.money += money;
  state.feathers += feathers;
  k.orders.splice(k.orders.indexOf(order), 1);
  emit(state, { type: "order-filled", money, feathers });
  return true;
}

function updateOrders(state: SimState, dt: number, rng: () => number): void {
  const k = state.kitchen;
  for (let i = k.orders.length - 1; i >= 0; i--) {
    k.orders[i].expires -= dt;
    if (k.orders[i].expires <= 0) {
      emit(state, { type: "order-expired", order: k.orders[i] });
      k.orders.splice(i, 1);
    }
  }
  const openStations: number[] = [];
  for (let st = 0; st < STATIONS.length; st++) if (stationUnlocked(state, st)) openStations.push(st);
  if (openStations.length === 0 || k.orders.length >= ORDER_MAX) return;
  if (k.nextOrderIn <= 0) k.nextOrderIn = ORDER_INTERVAL_MIN + rng() * ORDER_INTERVAL_VAR;
  k.nextOrderIn -= dt;
  if (k.nextOrderIn > 0) return;
  k.nextOrderIn = ORDER_INTERVAL_MIN + rng() * ORDER_INTERVAL_VAR;
  const needs = STATIONS.map(() => 0);
  const kinds = 1 + (rng() < 0.4 && openStations.length > 1 ? 1 : 0);
  for (let n = 0; n < kinds; n++) {
    const st = openStations[Math.floor(rng() * openStations.length)];
    needs[st] += 1 + Math.floor(rng() * 2);
  }
  const order: Order = { id: k.orderSeq++, needs, expires: ORDER_TTL };
  k.orders.push(order);
  emit(state, { type: "order-posted", order });
}

/** One kitchen step — called from tick() after the farm trucks. */
export function updateKitchen(state: SimState, dt: number, rng: () => number = Math.random): void {
  if (!kitchenUnlocked(state)) return;
  const k = state.kitchen;
  startCooks(state);
  for (let i = k.cooking.length - 1; i >= 0; i--) {
    const job = k.cooking[i];
    job.t -= dt;
    // Ready dishes sizzle for PLATE_WINDOW awaiting a Perfect tap, then
    // auto-plate at base value so idle play never loses food.
    if (job.t <= -PLATE_WINDOW) plateJob(state, job, false);
  }
  updateOrders(state, dt, rng);
  updateKitchenTruck(state, dt);
}

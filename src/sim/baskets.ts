// Baskets and their trucks — a state machine per basket, ported 1:1 from the
// prototype's truckUpdate. Truck x is sim state: it decides when the payout
// lands, which is gameplay timing.

import {
  TRUCK_DISPATCH_X,
  TRUCK_EXIT_MARGIN,
  TRUCK_START_X,
  TRUCK_STOP_OFFSET,
} from "../config/constants";
import { basketCap, featherGolden, featherPerEgg, lvl, truckPause, truckSchedule, truckSpeedIn, truckSpeedOut } from "./economy";
import { emit } from "./events";
import { routeToPantry } from "./kitchen";
import { applyBasketXs } from "./layout";
import type { Basket, SimState } from "./types";

export function addBasket(state: SimState): Basket {
  const b: Basket = {
    x: 0,
    load: [],
    count: 0,
    value: 0,
    feathers: 0,
    truckState: "idle",
    truckX: TRUCK_START_X,
    truckPause: 0,
    sched: 0,
  };
  state.baskets.push(b);
  applyBasketXs(state);
  return b;
}

/**
 * Nearest basket (by x) that still has room, or null if all are full.
 * Soft cap: while a basket's truck is already on its way (driving in or
 * loading), collection may keep piling it up to 2× cap — the truck takes
 * everything present. The hard "Baskets full!" wall only exists while a
 * full basket's truck is idle.
 */
export function basketWithSpace(state: SimState, nearX: number): Basket | null {
  const cap = basketCap(state);
  let best: Basket | null = null;
  let bd = Infinity;
  for (const b of state.baskets) {
    const limit = b.truckState === "in" || b.truckState === "load" ? cap * 2 : cap;
    if (b.count >= limit) continue;
    const d = Math.abs(b.x - nearX);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

export function updateTruck(state: SimState, b: Basket, dt: number): void {
  if (b.truckState === "idle") {
    const schedOn = lvl(state, "ttime") > 0;
    // The schedule timer only accumulates while the basket has ≥1 egg
    // (CLAUDE.md: silent timers read as bugs).
    if (b.count > 0) b.sched += dt;
    else b.sched = 0;
    const due =
      b.count >= basketCap(state) ||
      (schedOn && b.count > 0 && b.sched >= truckSchedule(state));
    if (due) {
      b.truckState = "in";
      b.truckX = TRUCK_DISPATCH_X;
      b.sched = 0;
      emit(state, { type: "truck-dispatched", basket: b, index: state.baskets.indexOf(b) });
    }
    return;
  }
  if (b.truckState === "in") {
    b.truckX += truckSpeedIn(state) * dt;
    if (b.truckX >= b.x - TRUCK_STOP_OFFSET) {
      b.truckState = "load";
      b.truckPause = truckPause(state);
    }
  } else if (b.truckState === "load") {
    b.truckPause -= dt;
    if (b.truckPause <= 0) {
      let money = b.value;
      let feathers = b.feathers;
      let count = b.count;
      // PLAN Phase 4 routing: the load is offered to the kitchen pantry
      // first; whatever doesn't fit is sold raw as before. Routed eggs pay
      // nothing here — their money and feathers arrive as cooked dishes.
      const routed = routeToPantry(state, b.load);
      for (let i = 0; i < routed; i++) {
        const egg = b.load[i];
        money -= egg.value;
        feathers -= egg.golden
          ? featherGolden(state, egg.species)
          : featherPerEgg(state, egg.species);
        count -= 1;
      }
      b.load.splice(0, routed);
      money = Math.max(0, money);
      feathers = Math.max(0, feathers);
      count = Math.max(0, count);
      state.money += money;
      state.feathers += feathers;
      state.totalDelivered += count;
      b.count = 0;
      b.value = 0;
      b.feathers = 0;
      b.load.length = 0;
      b.truckState = "out";
      emit(state, {
        type: "payout",
        basket: b,
        index: state.baskets.indexOf(b),
        money,
        feathers,
        count,
        routed,
      });
    }
  } else if (b.truckState === "out") {
    b.truckX += truckSpeedOut(state) * dt;
    if (b.truckX > state.layout.w + TRUCK_EXIT_MARGIN) {
      b.truckState = "idle";
      b.truckX = TRUCK_START_X;
    }
  }
}

/**
 * Seconds shown on the basket's truck countdown, or null when hidden
 * (no schedule level, empty basket, full basket, or truck already moving).
 */
export function truckCountdown(state: SimState, b: Basket): number | null {
  if (b.truckState !== "idle") return null;
  if (lvl(state, "ttime") < 1 || b.count <= 0 || b.count >= basketCap(state)) return null;
  return Math.max(0, Math.ceil(truckSchedule(state) - b.sched));
}

// Baskets and their trucks — a state machine per basket, ported 1:1 from the
// prototype's truckUpdate. Truck x is sim state: it decides when the payout
// lands, which is gameplay timing.

import {
  TRUCK_DISPATCH_X,
  TRUCK_EXIT_MARGIN,
  TRUCK_START_X,
  TRUCK_STOP_OFFSET,
} from "../config/constants";
import { basketCap, lvl, truckPause, truckSchedule, truckSpeedIn, truckSpeedOut } from "./economy";
import { emit } from "./events";
import { applyBasketXs } from "./layout";
import type { Basket, SimState } from "./types";

export function addBasket(state: SimState): Basket {
  const b: Basket = {
    x: 0,
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

/** Nearest basket (by x) that still has room, or null if all are full. */
export function basketWithSpace(state: SimState, nearX: number): Basket | null {
  const cap = basketCap(state);
  let best: Basket | null = null;
  let bd = Infinity;
  for (const b of state.baskets) {
    if (b.count >= cap) continue;
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
      const money = b.value;
      const feathers = b.feathers;
      const count = b.count;
      state.money += money;
      state.feathers += feathers;
      state.totalDelivered += count;
      b.count = 0;
      b.value = 0;
      b.feathers = 0;
      b.truckState = "out";
      emit(state, {
        type: "payout",
        basket: b,
        index: state.baskets.indexOf(b),
        money,
        feathers,
        count,
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

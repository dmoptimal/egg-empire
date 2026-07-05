// The Kitchen sim (PLAN.md Phase 4 + Dan's customer overhaul) — headless,
// like everything in src/sim. Farm trucks route egg loads into the pantry
// (see baskets.ts); hired chefs each work one pan, pulling eggs FIFO from the
// pantry. Plated dishes fill the COUNTER first (walk-in customers claim and
// buy those at a premium), then overflow onto the DELIVERY shelf, which the
// kitchen truck collects. Both sims always run.

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
  CUSTOMER_FEATHER_MULT,
  CUSTOMER_INTERVAL_MIN,
  CUSTOMER_INTERVAL_VAR,
  CUSTOMER_MAX,
  CUSTOMER_MAX_ITEMS,
  CUSTOMER_MONEY_MULT,
  CUSTOMER_PATIENCE,
  CUSTOMER_WALK_SPEED,
  KRUSH_BASE_DURATION,
  KRUSH_COOK_RATE,
  KRUSH_CUSTOMER_RATE,
  KRUSH_DURATION_PER_LVL,
  KRUSH_INTERVAL_MIN,
  KRUSH_INTERVAL_VAR,
  PANTRY_BASE_CAP,
  PANTRY_CAP_PER_LVL,
  PERFECT_MULT,
  PLATE_WINDOW,
  STATIONS,
  VIP_PATIENCE,
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
import type { BagEgg, CookJob, Customer, SimState } from "./types";

export const kitchenUnlocked = (s: SimState): boolean => lvl(s, "kitchen") >= 1;

export const stationUnlocked = (s: SimState, station: number): boolean =>
  lvl(s, STATIONS[station].id) >= 1;

export const pantryCap = (s: SimState): number =>
  PANTRY_BASE_CAP + PANTRY_CAP_PER_LVL * lvl(s, "pantry");

/** Long-counter node sizes both sections: the counter AND the delivery shelf. */
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

export const krushDuration = (s: SimState): number =>
  KRUSH_BASE_DURATION + KRUSH_DURATION_PER_LVL * (lvl(s, "krush") - 1);

/** Where table `slot` sits on the restaurant floor (render supplies the y). */
export const customerSlotX = (s: SimState, slot: number): number =>
  Math.min(46 + slot * 88, s.layout.w - 48);

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
  // Reserve space for everything already cooking so a finished dish always
  // has a slot (counter or delivery) — chefs idle rather than dropping food.
  const cap = counterCap(state);
  let capacity = cap - k.counter.length + (cap - k.delivery.length) - k.cooking.length;
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
    if (k.delivery.length > 0) t.sched += dt;
    else t.sched = 0;
    const due =
      k.delivery.length >= counterCap(state) ||
      (schedOn && k.delivery.length > 0 && t.sched >= truckSchedule(state));
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
      for (const dish of k.delivery) {
        money += dish.value;
        feathers += dish.feathers;
      }
      const dishes = k.delivery.length;
      state.money += money;
      state.feathers += feathers;
      state.totalDelivered += dishes;
      k.delivery.length = 0;
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

/**
 * Move a finished job onto the counter (customer section) or, when the
 * counter is full, the delivery shelf. Perfect taps pay +50%.
 */
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
  const target = k.counter.length < counterCap(state) ? "counter" : "delivery";
  (target === "counter" ? k.counter : k.delivery).push(dish);
  emit(state, { type: "dish-cooked", dish, perfect, station: job.station, target });
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

/** Counter dishes per station that no waiting/arriving customer has claimed. */
function unclaimedByStation(state: SimState): number[] {
  const avail = STATIONS.map(() => 0);
  for (const d of state.kitchen.counter) avail[d.station]++;
  for (const c of state.kitchen.customers) {
    if (c.state === "leave") continue;
    for (let st = 0; st < avail.length; st++) avail[st] -= c.needs[st];
  }
  return avail;
}

/** Whether the counter currently holds everything this customer claimed. */
export function canServeCustomer(state: SimState, customer: Customer): boolean {
  return customer.needs.every((qty, st) => {
    if (qty === 0) return true;
    let have = 0;
    for (const d of state.kitchen.counter) if (d.station === st) have++;
    return have >= qty;
  });
}

function spawnCustomer(state: SimState, rng: () => number, vip: boolean): boolean {
  const k = state.kitchen;
  const taken = new Set<number>();
  for (const c of k.customers) if (c.state !== "leave") taken.add(c.slot);
  if (taken.size >= CUSTOMER_MAX) return false;
  let slot = 0;
  while (taken.has(slot)) slot++;
  const needs = STATIONS.map(() => 0);
  if (!vip) {
    // Claim only dishes that are on the counter AND unclaimed by anyone else,
    // so every order is servable the moment they reach their spot.
    const avail = unclaimedByStation(state);
    let total = avail.reduce((a, b) => a + b, 0);
    if (total <= 0) return false;
    let want = Math.min(1 + Math.floor(rng() * CUSTOMER_MAX_ITEMS), total);
    while (want-- > 0) {
      let pick = Math.floor(rng() * total);
      for (let st = 0; st < avail.length; st++) {
        if (pick < avail[st]) {
          needs[st]++;
          avail[st]--;
          total--;
          break;
        }
        pick -= avail[st];
      }
    }
  }
  const customer: Customer = {
    id: k.customerSeq++,
    needs,
    x: -30,
    slot,
    state: "in",
    patience: vip ? VIP_PATIENCE : CUSTOMER_PATIENCE,
    look: Math.floor(rng() * 4),
    vip,
    happy: false,
  };
  k.customers.push(customer);
  emit(state, { type: "customer-arrived", customer });
  return true;
}

/**
 * Serve a waiting customer: consume their claimed dishes from the counter and
 * pay the premium. A VIP starts a Dinner Rush instead. Returns false when the
 * customer isn't at the counter yet (or has already left).
 */
export function serveCustomer(state: SimState, customerId: number): boolean {
  const k = state.kitchen;
  const customer = k.customers.find((c) => c.id === customerId);
  if (!customer || customer.state !== "wait") return false;
  if (customer.vip) {
    customer.state = "leave";
    customer.happy = true;
    k.krush.active = krushDuration(state);
    emit(state, { type: "krush-started", duration: k.krush.active, customer });
    return true;
  }
  if (!canServeCustomer(state, customer)) return false; // can't happen: claims are reserved
  let money = 0;
  let feathers = 0;
  let dishes = 0;
  for (let st = 0; st < customer.needs.length; st++) {
    let left = customer.needs[st];
    for (let i = 0; i < k.counter.length && left > 0; ) {
      if (k.counter[i].station === st) {
        money += k.counter[i].value;
        feathers += k.counter[i].feathers;
        k.counter.splice(i, 1);
        left--;
        dishes++;
      } else {
        i++;
      }
    }
  }
  money = Math.round(money * CUSTOMER_MONEY_MULT);
  feathers = Math.round(feathers * CUSTOMER_FEATHER_MULT);
  state.money += money;
  state.feathers += feathers;
  state.totalDelivered += dishes;
  customer.state = "leave";
  customer.happy = true;
  emit(state, { type: "customer-served", money, feathers, customer });
  return true;
}

function updateCustomers(state: SimState, dt: number, rng: () => number): void {
  const k = state.kitchen;

  // Dinner Rush countdowns: the frenzy itself, then the next VIP walk-in.
  if (k.krush.active > 0) {
    k.krush.active -= dt;
    if (k.krush.active <= 0) {
      k.krush.active = 0;
      emit(state, { type: "krush-ended" });
    }
  }
  if (lvl(state, "krush") >= 1) {
    if (k.krush.next <= 0) k.krush.next = KRUSH_INTERVAL_MIN + rng() * KRUSH_INTERVAL_VAR;
    k.krush.next -= dt;
    if (k.krush.next <= 0)
      k.krush.next = spawnCustomer(state, rng, true)
        ? KRUSH_INTERVAL_MIN + rng() * KRUSH_INTERVAL_VAR
        : 1; // queue full — knock again in a second
  }

  // Regular walk-ins, ×KRUSH_CUSTOMER_RATE while a rush runs. The spawn gate
  // (a free slot + at least one unclaimed dish) throttles the flow to actual
  // production, so the 5-10s cadence is a ceiling, not a promise.
  if (k.nextCustomerIn <= 0) k.nextCustomerIn = CUSTOMER_INTERVAL_MIN + rng() * CUSTOMER_INTERVAL_VAR;
  k.nextCustomerIn -= dt * (k.krush.active > 0 ? KRUSH_CUSTOMER_RATE : 1);
  if (k.nextCustomerIn <= 0)
    k.nextCustomerIn = spawnCustomer(state, rng, false)
      ? CUSTOMER_INTERVAL_MIN + rng() * CUSTOMER_INTERVAL_VAR
      : 0.75; // nothing to sell yet — peek in again shortly

  // Walk in → wait (patience) → walk out; gone once off-screen left.
  for (let i = k.customers.length - 1; i >= 0; i--) {
    const c = k.customers[i];
    if (c.state === "in") {
      const target = customerSlotX(state, c.slot);
      c.x += CUSTOMER_WALK_SPEED * dt;
      if (c.x >= target) {
        c.x = target;
        c.state = "wait";
      }
    } else if (c.state === "wait") {
      c.patience -= dt;
      if (c.patience <= 0) {
        c.state = "leave";
        c.happy = false;
        emit(state, { type: "customer-left", customer: c });
      }
    } else {
      c.x -= CUSTOMER_WALK_SPEED * dt;
      if (c.x < -40) k.customers.splice(i, 1);
    }
  }
}

/** One kitchen step — called from tick() after the farm trucks. */
export function updateKitchen(state: SimState, dt: number, rng: () => number = Math.random): void {
  if (!kitchenUnlocked(state)) return;
  const k = state.kitchen;
  startCooks(state);
  const cookRate = k.krush.active > 0 ? KRUSH_COOK_RATE : 1;
  for (let i = k.cooking.length - 1; i >= 0; i--) {
    const job = k.cooking[i];
    // A Dinner Rush speeds the cooking, never the sizzle window — the player
    // gets the full PLATE_WINDOW to tap even mid-frenzy.
    job.t -= dt * (job.t > 0 ? cookRate : 1);
    // Ready dishes sizzle for PLATE_WINDOW awaiting a Perfect tap, then
    // auto-plate at base value so idle play never loses food.
    if (job.t <= -PLATE_WINDOW) plateJob(state, job, false);
  }
  updateCustomers(state, dt, rng);
  updateKitchenTruck(state, dt);
}

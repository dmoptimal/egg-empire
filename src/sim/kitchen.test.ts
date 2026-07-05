// PLAN.md Phase 4 acceptance: routing overflow, cook timing, multi-egg
// recipes, golden premium dishes, counter/truck flow — all headless.

import { describe, expect, it } from "vitest";
import { COUNTER_BASE_CAP, ORDER_INTERVAL_MIN, ORDER_INTERVAL_VAR, ORDER_TTL, PANTRY_BASE_CAP, PLATE_WINDOW, STATIONS } from "../config/kitchen";
import { drainEvents } from "./events";
import {
  canFillOrder,
  chefCost,
  chefSlots,
  cookTime,
  counterCap,
  dishValueMult,
  fillOrder,
  hireChef,
  pantryCap,
  plateStation,
  routeToPantry,
  stationReady,
  updateKitchen,
} from "./kitchen";
import { restore, serialize } from "./save";
import { createSim } from "./state";
import { constHooks, step } from "./test-helpers";
import type { BagEgg, SimEvent, SimState } from "./types";

const egg = (value: number, golden = false, species = 0): BagEgg => ({ value, golden, species });

function kitchenSim(stations: number[] = [0], chefsAt: Record<number, number> = { 0: 1 }): SimState {
  const s = createSim();
  s.counts = [0, 0, 0, 0, 0];
  s.n.kitchen = 1;
  for (const st of stations) s.n[STATIONS[st].id] = 1;
  for (const [st, c] of Object.entries(chefsAt)) s.kitchen.chefs[Number(st)] = c;
  return s;
}

describe("the gate", () => {
  it("without the kitchen node nothing routes and nothing runs", () => {
    const s = createSim();
    s.counts = [0, 0, 0, 0, 0];
    expect(routeToPantry(s, [egg(10)])).toBe(0);
    s.kitchen.pantry.push(egg(10));
    s.kitchen.chefs[0] = 1;
    s.n.st_boil = 1;
    step(s, 10, constHooks(0.5));
    expect(s.kitchen.counter).toHaveLength(0); // updateKitchen no-ops
  });
});

describe("routing (auto, pantry-first)", () => {
  it("a farm payout fills the pantry first and sells the overflow raw", () => {
    const s = kitchenSim([0], {}); // unlocked kitchen, no chefs — eggs just park
    const b = s.baskets[0];
    for (let i = 0; i < 40; i++) {
      b.load.push(egg(10));
      b.count++;
      b.value += 10;
      b.feathers += 1;
    }
    step(s, 6, constHooks(0.5)); // count ≥ cap → dispatch → payout
    const evs = drainEvents(s);
    const payout = evs.find((e): e is Extract<SimEvent, { type: "payout" }> => e.type === "payout")!;
    expect(payout.routed).toBe(PANTRY_BASE_CAP);
    expect(payout.money).toBe(100); // 10 raw eggs × $10
    expect(payout.feathers).toBe(10);
    expect(payout.count).toBe(10);
    expect(s.kitchen.pantry).toHaveLength(PANTRY_BASE_CAP);
    expect(s.money).toBe(100);
    expect(s.totalDelivered).toBe(10);
  });

  it("routeToPantry respects remaining space and copies, never mutates", () => {
    const s = kitchenSim();
    s.kitchen.pantry = Array.from({ length: 25 }, () => egg(10));
    const load = [egg(1), egg(2), egg(3), egg(4), egg(5), egg(6), egg(7)];
    expect(routeToPantry(s, load)).toBe(5);
    expect(load).toHaveLength(7);
    expect(s.kitchen.pantry).toHaveLength(PANTRY_BASE_CAP);
    expect(s.kitchen.pantry[25].value).toBe(1);
  });
});

describe("cooking", () => {
  it("boils one egg in 4s into a ×3 dish with tier feathers", () => {
    const s = kitchenSim();
    s.kitchen.pantry.push(egg(10));
    step(s, 3.9, constHooks(0.5));
    expect(s.kitchen.counter).toHaveLength(0);
    expect(s.kitchen.cooking).toHaveLength(1);
    expect(s.kitchen.pantry).toHaveLength(0); // eggs leave the pantry at pan-time
    step(s, 0.3 + PLATE_WINDOW, constHooks(0.5)); // sizzle window, then auto-plate
    expect(s.kitchen.counter).toEqual([{ station: 0, value: 30, feathers: 1, golden: false }]);
    expect(drainEvents(s).filter((e) => e.type === "dish-cooked")).toHaveLength(1);
  });

  it("scrambled takes 2 eggs and omelette 3, valuing the sum", () => {
    const s = kitchenSim([2, 4], { 2: 1, 4: 1 });
    s.kitchen.pantry.push(egg(10), egg(20), egg(30), egg(40), egg(50));
    step(s, 18.2 + PLATE_WINDOW, constHooks(0.5));
    // scrambled: 10+20 → ×9 = 270 (8s); omelette: 30+40+50 → ×45 = 5400 (18s)
    expect(s.kitchen.counter).toContainEqual({ station: 2, value: 270, feathers: 2, golden: false });
    expect(s.kitchen.counter).toContainEqual({ station: 4, value: 5400, feathers: 3, golden: false });
  });

  it("golden eggs cook into premium dishes (×10 already in the value)", () => {
    const s = kitchenSim();
    s.kitchen.pantry.push(egg(100, true)); // golden chicken egg
    step(s, 4.2 + PLATE_WINDOW, constHooks(0.5));
    expect(s.kitchen.counter).toEqual([{ station: 0, value: 300, feathers: 15, golden: true }]);
  });

  it("one chef works one pan; more chefs cook in parallel", () => {
    const s = kitchenSim([0], { 0: 2 });
    s.kitchen.pantry.push(egg(10), egg(10), egg(10));
    step(s, 4.2 + PLATE_WINDOW, constHooks(0.5));
    expect(s.kitchen.counter).toHaveLength(2); // two pans auto-plated together
    expect(s.kitchen.cooking).toHaveLength(1); // third egg started when a pan freed
  });

  it("a full counter blocks new cooks instead of losing dishes", () => {
    const s = kitchenSim();
    s.kitchen.counter = Array.from({ length: COUNTER_BASE_CAP }, () => ({
      station: 0, value: 1, feathers: 0, golden: false,
    }));
    s.n.ttime = 0; // no schedule: the full counter dispatches the truck, so
    s.kitchen.truck.truckState = "out"; // park it mid-run for this check
    s.kitchen.pantry.push(egg(10));
    updateKitchen(s, 0.1);
    expect(s.kitchen.cooking).toHaveLength(0);
    expect(s.kitchen.pantry).toHaveLength(1);
  });
});

describe("the kitchen truck", () => {
  it("collects a full counter and pays the dish sum", () => {
    const s = kitchenSim();
    s.kitchen.counter = Array.from({ length: COUNTER_BASE_CAP }, () => ({
      station: 0, value: 30, feathers: 2, golden: false,
    }));
    step(s, 6, constHooks(0.5));
    const evs = drainEvents(s);
    const payout = evs.find((e): e is Extract<SimEvent, { type: "kitchen-payout" }> => e.type === "kitchen-payout")!;
    expect(evs.some((e) => e.type === "kitchen-truck-dispatched")).toBe(true);
    expect(payout.money).toBe(600);
    expect(payout.feathers).toBe(40);
    expect(payout.dishes).toBe(COUNTER_BASE_CAP);
    expect(s.money).toBe(600);
    expect(s.kitchen.counter).toHaveLength(0);
  });

  it("the shared truck-schedule tech collects part-full counters", () => {
    const s = kitchenSim();
    s.n.ttime = 5; // 4s schedule
    s.kitchen.counter.push({ station: 0, value: 30, feathers: 1, golden: false });
    step(s, 3.5, constHooks(0.5));
    expect(s.kitchen.truck.truckState).toBe("idle");
    step(s, 3, constHooks(0.5));
    expect(s.money).toBe(30);
  });
});

describe("tap-to-plate (fun pass #3)", () => {
  it("a finished dish sizzles; a tap inside the window plates it Perfect", () => {
    const s = kitchenSim();
    s.kitchen.pantry.push(egg(10));
    step(s, 4.5, constHooks(0.5)); // cooked at 4s, now sizzling
    expect(s.kitchen.counter).toHaveLength(0);
    expect(stationReady(s, 0)).toBe(true);
    expect(plateStation(s, 0)).toBe(true);
    expect(s.kitchen.counter).toEqual([{ station: 0, value: 45, feathers: 1, golden: false }]); // 30 × 1.5
    const evs = drainEvents(s);
    const cooked = evs.find((e) => e.type === "dish-cooked");
    expect(cooked && "perfect" in cooked && cooked.perfect).toBe(true);
    expect(stationReady(s, 0)).toBe(false);
  });

  it("untapped dishes auto-plate at base value after the window", () => {
    const s = kitchenSim();
    s.kitchen.pantry.push(egg(10));
    step(s, 4 + PLATE_WINDOW + 0.3, constHooks(0.5));
    expect(s.kitchen.counter).toEqual([{ station: 0, value: 30, feathers: 1, golden: false }]);
    const cooked = drainEvents(s).find((e) => e.type === "dish-cooked");
    expect(cooked && "perfect" in cooked && cooked.perfect).toBe(false);
  });

  it("a sizzling pan blocks the chef until it is plated", () => {
    const s = kitchenSim();
    s.kitchen.pantry.push(egg(10), egg(10));
    step(s, 5, constHooks(0.5)); // first dish ready, chef waiting
    expect(s.kitchen.pantry).toHaveLength(1);
    plateStation(s, 0);
    step(s, 0.2, constHooks(0.5)); // pan free → second egg starts
    expect(s.kitchen.pantry).toHaveLength(0);
    expect(s.kitchen.cooking).toHaveLength(1);
  });

  it("tapping an idle station is a no-op", () => {
    const s = kitchenSim();
    expect(plateStation(s, 0)).toBe(false);
  });
});

describe("order tickets (fun pass #4)", () => {
  it("tickets post on the cadence, only for unlocked stations, capped at 2", () => {
    const s = kitchenSim([0], {});
    const interval = ORDER_INTERVAL_MIN + 0.5 * ORDER_INTERVAL_VAR;
    step(s, interval + 1, constHooks(0.5));
    expect(s.kitchen.orders).toHaveLength(1);
    expect(s.kitchen.orders[0].needs[0]).toBeGreaterThan(0);
    expect(s.kitchen.orders[0].needs.slice(1).every((q) => q === 0)).toBe(true);
    step(s, 400, constHooks(0.5));
    expect(s.kitchen.orders.length).toBeLessThanOrEqual(2);
  });

  it("filling an order consumes the dishes and pays the multipliers", () => {
    const s = kitchenSim([0], {});
    s.kitchen.counter.push(
      { station: 0, value: 30, feathers: 2, golden: false },
      { station: 0, value: 30, feathers: 2, golden: false },
      { station: 1, value: 99, feathers: 9, golden: false },
    );
    s.kitchen.orders.push({ id: 7, needs: [2, 0, 0, 0, 0], expires: 60 });
    expect(canFillOrder(s, s.kitchen.orders[0])).toBe(true);
    expect(fillOrder(s, 7)).toBe(true);
    expect(s.money).toBe(150); // (30+30) × 2.5
    expect(s.feathers).toBe(8); // (2+2) × 2
    expect(s.kitchen.counter).toEqual([{ station: 1, value: 99, feathers: 9, golden: false }]);
    expect(s.kitchen.orders).toHaveLength(0);
    expect(drainEvents(s).some((e) => e.type === "order-filled")).toBe(true);
  });

  it("cannot fill without the dishes", () => {
    const s = kitchenSim([0], {});
    s.kitchen.orders.push({ id: 3, needs: [2, 0, 0, 0, 0], expires: 60 });
    s.kitchen.counter.push({ station: 0, value: 30, feathers: 2, golden: false });
    expect(fillOrder(s, 3)).toBe(false);
    expect(s.money).toBe(0);
    expect(s.kitchen.orders).toHaveLength(1);
  });

  it("unfilled tickets expire", () => {
    const s = kitchenSim([0], {});
    s.kitchen.orders.push({ id: 9, needs: [1, 0, 0, 0, 0], expires: ORDER_TTL });
    step(s, ORDER_TTL + 1, constHooks(0.5));
    expect(s.kitchen.orders.find((o) => o.id === 9)).toBeUndefined();
    expect(drainEvents(s).some((e) => e.type === "order-expired")).toBe(true);
  });
});

describe("Phase 6 support nodes", () => {
  it("wire their effects: pantry, counter, ckspd, ckval, chefs2", () => {
    const s = kitchenSim();
    expect(pantryCap(s)).toBe(PANTRY_BASE_CAP);
    expect(counterCap(s)).toBe(COUNTER_BASE_CAP);
    expect(cookTime(s, 0)).toBe(4);
    expect(dishValueMult(s, 0)).toBe(3);
    expect(chefSlots(s, 0)).toBe(3);
    s.n.pantry = 5;
    s.n.counter = 3;
    s.n.ckspd = 2;
    s.n.ckval = 5;
    s.n.chefs2 = 2;
    expect(pantryCap(s)).toBe(180); // 30 + 30×5
    expect(counterCap(s)).toBe(80); // 20 + 20×3
    expect(cookTime(s, 0)).toBeCloseTo(4 * 0.81, 10);
    expect(dishValueMult(s, 0)).toBeCloseTo(4.5, 10); // 3 × 1.5
    expect(chefSlots(s, 0)).toBe(5);
  });

  it("seasoned faster pans change live dish output", () => {
    const s = kitchenSim();
    s.n.ckspd = 5; // 4s → 2.36s
    s.n.ckval = 5; // ×1.5
    s.kitchen.pantry.push(egg(10));
    step(s, 2.5 + PLATE_WINDOW, constHooks(0.5));
    expect(s.kitchen.counter).toEqual([{ station: 0, value: 45, feathers: 1, golden: false }]);
  });
});

describe("chefs", () => {
  it("hireChef guards station locks, slots, and money", () => {
    const s = kitchenSim([0], {});
    expect(hireChef(s, 1)).toBe(false); // fried locked
    expect(hireChef(s, 0)).toBe(false); // broke
    s.money = chefCost(s, 0);
    expect(hireChef(s, 0)).toBe(true);
    expect(s.money).toBe(0);
    expect(s.kitchen.chefs[0]).toBe(1);
    expect(chefCost(s, 0)).toBe(180000); // 60K × 3
    s.kitchen.chefs[0] = chefSlots(s, 0);
    s.money = 1e12;
    expect(hireChef(s, 0)).toBe(false); // slots full
  });

  it("hired chefs survive a save round-trip", () => {
    const s = kitchenSim([0], { 0: 2 });
    const back = restore(serialize(s, 0))!;
    expect(back.kitchen.chefs[0]).toBe(2);
    expect(back.kitchen.pantry).toHaveLength(0); // pantry/counter are ephemeral
  });
});

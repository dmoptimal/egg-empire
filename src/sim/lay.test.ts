// Lay rates: the fixed accumulator must produce eggs at counts/interval per
// second, respect the per-frame burst cap, and honour lay-speed upgrades.

import { describe, expect, it } from "vitest";
import { drainEvents } from "./events";
import { createSim } from "./state";
import { constHooks, step } from "./test-helpers";
import { tick } from "./tick";

const laidCount = (evs: ReturnType<typeof drainEvents>) =>
  evs.filter((e) => e.type === "egg-laid").length;

describe("lay accumulation", () => {
  it("2 chickens at 4s interval lay 5 eggs in ~10s", () => {
    const s = createSim();
    step(s, 10.1, constHooks(0.5));
    expect(laidCount(drainEvents(s))).toBe(5);
  });

  it("lay speed level 5 shortens the interval to 4·0.9⁵", () => {
    const s = createSim();
    s.n.s0 = 5;
    step(s, 10.1, constHooks(0.5));
    // 10.1s * 2 birds / 2.36196s = 8.55 → 8 whole eggs
    expect(laidCount(drainEvents(s))).toBe(8);
  });

  it("locked species and zero-count species lay nothing", () => {
    const s = createSim();
    s.counts = [0, 5, 0, 0, 0]; // ducks owned but not unlocked; chickens gone
    step(s, 20, constHooks(0.5));
    expect(laidCount(drainEvents(s))).toBe(0);
    expect(s.layAcc.every((a) => a === 0)).toBe(true);
  });

  it("bursts are capped at 6 eggs per species per frame, accumulator at 8", () => {
    const s = createSim();
    s.n.sp2 = 1;
    s.counts = [0, 0, 400, 0, 0]; // 400 quail: +25 eggs owed per 0.1s frame
    for (let i = 0; i < 10; i++) {
      tick(s, 0.1, constHooks(0.5));
      expect(laidCount(drainEvents(s))).toBeLessThanOrEqual(6);
      expect(s.layAcc[2]).toBeLessThanOrEqual(8);
    }
  });
});

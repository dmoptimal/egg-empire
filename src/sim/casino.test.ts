// The Bird Casino (pachinko) — gate, drop pricing, physics-to-payout,
// double-yolk splits, the roost dropper, and its bankroll guard.

import { describe, expect, it } from "vitest";
import {
  AUTO_DROP_INTERVAL,
  AUTO_MIN_BANKROLL,
  BIN_MULTS,
  BOUNCY_PER_LVL,
  MAX_BALLS,
  SPLIT_PER_LVL,
} from "../config/casino";
import { binMult, casinoUnlocked, dropBall, dropCost, pinKind } from "./casino";
import { drainEvents } from "./events";
import { createSim } from "./state";
import { constHooks, step } from "./test-helpers";
import type { SimEvent } from "./types";

function casinoSim() {
  const s = createSim();
  s.n.casino = 1;
  s.money = 1e9;
  return s;
}

const payouts = (evs: SimEvent[]) =>
  evs.filter((e): e is Extract<SimEvent, { type: "casino-payout" }> => e.type === "casino-payout");

describe("the gate", () => {
  it("locked: no drops, no physics", () => {
    const s = createSim();
    s.money = 1e9;
    expect(casinoUnlocked(s)).toBe(false);
    expect(dropBall(s, () => 0.5)).toBe(false);
    expect(s.casino.balls).toHaveLength(0);
  });
});

describe("drops", () => {
  it("cost one best-species egg at live pricing", () => {
    const s = casinoSim();
    expect(dropCost(s)).toBe(10); // chicken egg
    s.n.w0 = 2; // ×2.25 worth
    expect(dropCost(s)).toBe(Math.round(10 * 2.25));
  });

  it("charge money and spawn a ball", () => {
    const s = casinoSim();
    expect(dropBall(s, () => 0.5)).toBe(true);
    expect(s.money).toBe(1e9 - 10);
    expect(s.casino.balls).toHaveLength(1);
    expect(drainEvents(s).some((e) => e.type === "casino-payout")).toBe(false);
  });

  it("cap in-flight balls at MAX_BALLS", () => {
    const s = casinoSim();
    for (let i = 0; i < MAX_BALLS + 10; i++) dropBall(s, () => 0.5);
    expect(s.casino.balls).toHaveLength(MAX_BALLS);
  });

  it("a dropped egg rattles down and pays value × its basket", () => {
    const s = casinoSim();
    dropBall(s, () => 0.5);
    step(s, 8, constHooks(0.5)); // plenty of time to settle
    expect(s.casino.balls).toHaveLength(0);
    const [pay] = payouts(drainEvents(s));
    expect(pay).toBeDefined();
    expect(pay.money).toBe(Math.round(pay.ball.value * binMult(s, pay.bin)));
    expect(pay.ball.value).toBeGreaterThanOrEqual(10); // pin hits only add value
    expect(s.money).toBe(1e9 - 10 + pay.money);
  });
});

describe("upgrades", () => {
  it("Loaded baskets fatten every multiplier", () => {
    const s = casinoSim();
    expect(binMult(s, 0)).toBe(BIN_MULTS[0]);
    s.n.pval = 3;
    expect(binMult(s, 0)).toBeCloseTo(BIN_MULTS[0] * 1.6, 10);
  });

  it("special pins are visible board features, added level by level", () => {
    const s = casinoSim();
    const count = (kind: string): number => {
      let n = 0;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) if (pinKind(s, r, c) === kind) n++;
      return n;
    };
    expect(count("bouncy")).toBe(0);
    expect(count("split")).toBe(0);
    s.n.pbounce = 2;
    s.n.pdup = 1;
    expect(count("bouncy")).toBe(BOUNCY_PER_LVL * 2);
    expect(count("split")).toBe(SPLIT_PER_LVL);
    s.n.pbounce = 3;
    s.n.pdup = 3;
    expect(count("bouncy")).toBe(BOUNCY_PER_LVL * 3);
    expect(count("split")).toBe(SPLIT_PER_LVL * 3);
  });

  it("pink pins split eggs — both halves pay out", () => {
    const s = casinoSim();
    s.n.pdup = 3; // six pink pins on the board; rng 0.3 < split chance
    for (let i = 0; i < 10; i++) dropBall(s, () => 0.3 + i * 0.04);
    step(s, 10, constHooks(0.3));
    const evs = drainEvents(s);
    expect(evs.some((e) => e.type === "casino-split")).toBe(true);
    expect(payouts(evs).length).toBeGreaterThan(10); // more payouts than drops
  });

  it("the Roost dropper feeds the machine on its cadence", () => {
    const s = casinoSim();
    s.n.pauto = 1;
    step(s, AUTO_DROP_INTERVAL[1] + 0.5, constHooks(0.5));
    const drop = drainEvents(s).find((e) => e.type === "casino-drop");
    expect(drop && "auto" in drop && drop.auto).toBe(true);
  });

  it("…but never gambles a thin bankroll away", () => {
    const s = casinoSim();
    s.n.pauto = 3;
    s.money = dropCost(s) * (AUTO_MIN_BANKROLL - 1);
    step(s, 30, constHooks(0.5));
    expect(drainEvents(s).some((e) => e.type === "casino-drop")).toBe(false);
  });
});

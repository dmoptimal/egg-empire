// The Bird Casino (pachinko) — gate, drop pricing, physics-to-payout,
// double-yolk splits, the roost dropper, and its bankroll guard.

import { describe, expect, it } from "vitest";
import {
  AUTO_DROP_INTERVAL,
  AUTO_MIN_BANKROLL,
  BIN_MULTS,
  BOUNCY_PER_LVL,
  MAX_BALLS,
  ROULETTE_MULTS,
  SLOT_PAY2,
  SLOT_PAY3,
  SLOT_REEL_STOPS,
  SPLIT_PER_LVL,
} from "../config/casino";
import {
  binMult,
  casinoUnlocked,
  dropBall,
  dropCost,
  pinKind,
  rouletteMult,
  slotPayMult,
  spinRoulette,
  spinSlots,
} from "./casino";
import { SLOT_STRIP, SLUCK_RESPIN_PER_LVL } from "../config/casino";
import type { SimState } from "./types";

/** Exact slots EV from the strip, paytable and live upgrades. */
function slotsEV(s: SimState): number {
  const p = [0, 0, 0, 0, 0];
  for (const sym of SLOT_STRIP) p[sym] += 1 / SLOT_STRIP.length;
  let ev = 0;
  let pWin = 0;
  for (let sym = 0; sym < 5; sym++) {
    pWin += p[sym] * p[sym];
    ev += p[sym] ** 2 * (1 - p[sym]) * SLOT_PAY2[sym] + p[sym] ** 3 * SLOT_PAY3[sym];
  }
  ev *= slotPayMult(s);
  // free respins on losses form a geometric series on the same stake
  const respin = (1 - pWin) * SLUCK_RESPIN_PER_LVL * (s.n.sluck ?? 0);
  return ev / (1 - respin);
}
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

describe("roulette", () => {
  it("the wheel is exactly fair (multipliers average ×1)", () => {
    expect(ROULETTE_MULTS.reduce((a, b) => a + b, 0)).toBe(ROULETTE_MULTS.length);
  });

  it("a spin stakes chips × one egg and pays the slice it stops on", () => {
    const s = casinoSim();
    expect(spinRoulette(s, () => 0.5, 10)).toBe(true);
    expect(s.money).toBe(1e9 - 100); // 10 chips × the $10 chicken egg
    expect(spinRoulette(s, () => 0.5, 1)).toBe(false); // still turning
    step(s, 12, constHooks(0.5)); // 11.5 rad/s over 1.5 rad/s² ≈ 7.7s
    expect(s.casino.roulette.vel).toBe(0);
    const ev = drainEvents(s).find(
      (e): e is Extract<SimEvent, { type: "roulette-stopped" }> => e.type === "roulette-stopped",
    )!;
    expect(ev).toBeDefined();
    expect(ev.money).toBe(Math.round(100 * ROULETTE_MULTS[ev.slice]));
    expect(s.money).toBe(1e9 - 100 + ev.money);
  });

  it("rejects a stake the bankroll can't cover", () => {
    const s = casinoSim();
    s.money = 5;
    expect(spinRoulette(s, () => 0.5, 1)).toBe(false);
    expect(s.money).toBe(5);
  });
});

describe("slots", () => {
  it("start with a gentle house edge; maxed upgrades tip past even", () => {
    const s = casinoSim();
    const base = slotsEV(s);
    expect(base).toBeGreaterThan(0.85);
    expect(base).toBeLessThan(0.98);
    s.n.sluck = 3;
    s.n.spay = 3;
    const maxed = slotsEV(s);
    expect(maxed).toBeGreaterThan(1.05);
    expect(maxed).toBeLessThan(1.6);
  });

  it("a pull stakes the chips, reels thunk in order, the run pays", () => {
    const s = casinoSim();
    expect(spinSlots(s, () => 0.5, 10)).toBe(true);
    expect(s.money).toBe(1e9 - 100);
    expect(spinSlots(s, () => 0.5, 1)).toBe(false); // reels still turning
    step(s, SLOT_REEL_STOPS[2] + 0.2, constHooks(0.5));
    const evs = drainEvents(s);
    expect(evs.filter((e) => e.type === "slots-reel")).toHaveLength(3);
    const done = evs.find(
      (e): e is Extract<SimEvent, { type: "slots-stopped" }> => e.type === "slots-stopped",
    )!;
    expect(done).toBeDefined();
    // rng 0.5 draws strip[8] = feather on every reel: a triple
    expect(done.symbols).toEqual([1, 1, 1]);
    expect(done.run).toBe(3);
    expect(done.money).toBe(Math.round(100 * SLOT_PAY3[1]));
    expect(s.money).toBe(1e9 - 100 + done.money);
    expect(s.stats.slotsBest).toBe(done.money);
  });

  it("Lucky reels respins a losing pull free, stake still on", () => {
    const s = casinoSim();
    s.n.sluck = 3; // 24% respin chance
    const seq = [0.05, 0.45, 0.95]; // egg, feather, star — a losing spread
    let i = 0;
    spinSlots(s, () => seq[Math.min(i++, 2)], 1);
    // roll 0.05 < 0.24 → free respin; the redraw at 0.05³ lands triple eggs
    step(s, 4.6, constHooks(0.05));
    const evs = drainEvents(s);
    expect(evs.some((e) => e.type === "slots-respin")).toBe(true);
    const done = evs.find(
      (e): e is Extract<SimEvent, { type: "slots-stopped" }> => e.type === "slots-stopped",
    )!;
    expect(done.run).toBe(3); // the respin saved the pull
    expect(s.money).toBe(1e9 - 10 + Math.round(10 * SLOT_PAY3[0]));
  });
});

describe("Loaded wheel", () => {
  it("turns house slices green, one per level", () => {
    const s = casinoSim();
    const zeros = () => ROULETTE_MULTS.filter((_, i) => rouletteMult(s, i) === 0).length;
    const before = zeros();
    s.n.rwheel = 3;
    expect(zeros()).toBe(before - 3);
    expect(rouletteMult(s, 15)).toBe(1);
    expect(rouletteMult(s, 0)).toBe(ROULETTE_MULTS[0]); // paying slices untouched
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

// Truck state machine: schedule gating (the README-mandated behaviour), the
// full dispatch → load → payout → exit cycle, and an end-to-end run from lay
// to money in the bank.

import { describe, expect, it } from "vitest";
import { truckCountdown } from "./baskets";
import { sweepCollect } from "./collect";
import { drainEvents } from "./events";
import { createSim } from "./state";
import { constHooks, step } from "./test-helpers";
import { tick } from "./tick";
import type { Egg, SimEvent } from "./types";

function quietSim() {
  const s = createSim();
  s.counts = [0, 0, 0, 0, 0];
  return s;
}

describe("truck schedule gating", () => {
  it("without the schedule node, a part-full basket never dispatches", () => {
    const s = quietSim();
    s.baskets[0].count = 1;
    s.baskets[0].value = 10;
    step(s, 60, constHooks(0.5));
    expect(s.baskets[0].truckState).toBe("idle");
    expect(s.money).toBe(0);
    expect(truckCountdown(s, s.baskets[0])).toBeNull();
  });

  it("the schedule timer only accumulates while the basket holds eggs", () => {
    const s = quietSim();
    s.n.ttime = 1; // 30s schedule
    step(s, 20, constHooks(0.5));
    expect(s.baskets[0].sched).toBe(0); // empty: no accumulation

    s.baskets[0].count = 1;
    s.baskets[0].value = 10;
    step(s, 10.5, constHooks(0.5));
    expect(s.baskets[0].sched).toBeCloseTo(10.5, 5);
    expect(truckCountdown(s, s.baskets[0])).toBe(20); // ceil(30 - 10.5)

    s.baskets[0].count = 0; // emptied again → timer resets
    tick(s, 1 / 60, constHooks(0.5));
    expect(s.baskets[0].sched).toBe(0);
    expect(truckCountdown(s, s.baskets[0])).toBeNull();
  });

  it("dispatches a part-full basket once the schedule elapses", () => {
    const s = quietSim();
    s.n.ttime = 5; // 10s schedule at max level
    s.baskets[0].count = 3;
    s.baskets[0].value = 30;
    step(s, 9.9, constHooks(0.5));
    expect(s.baskets[0].truckState).toBe("idle");
    step(s, 0.3, constHooks(0.5));
    expect(s.baskets[0].truckState).not.toBe("idle");
    expect(
      drainEvents(s).filter((e) => e.type === "truck-dispatched"),
    ).toHaveLength(1);
  });

  it("a full basket dispatches immediately, schedule or not", () => {
    const s = quietSim();
    s.baskets[0].count = 12; // base cap
    tick(s, 1 / 60, constHooks(0.5));
    expect(s.baskets[0].truckState).toBe("in");
  });
});

describe("delivery cycle", () => {
  it("drives in, pauses to load, pays out, drives off, and resets", () => {
    const s = quietSim();
    s.baskets[0].count = 12;
    s.baskets[0].value = 120;
    s.baskets[0].feathers = 12;
    step(s, 6, constHooks(0.5)); // ample for in (≈1.4s) + pause (0.9s) + out
    const evs = drainEvents(s);
    const payouts = evs.filter((e): e is Extract<SimEvent, { type: "payout" }> => e.type === "payout");
    expect(payouts).toHaveLength(1);
    expect(payouts[0].money).toBe(120);
    expect(payouts[0].feathers).toBe(12);
    expect(payouts[0].count).toBe(12);
    expect(s.money).toBe(120);
    expect(s.feathers).toBe(12);
    expect(s.totalDelivered).toBe(12);
    expect(s.baskets[0].count).toBe(0);
    expect(s.baskets[0].value).toBe(0);
    expect(s.baskets[0].truckState).toBe("idle");
    expect(s.baskets[0].truckX).toBe(-120);
  });

  it("truck speed upgrades shorten the run", () => {
    const slow = quietSim();
    const fast = quietSim();
    fast.n.tspd = 5;
    for (const s of [slow, fast]) {
      s.baskets[0].count = 12;
      s.baskets[0].value = 10;
    }
    step(fast, 1.5, constHooks(0.5));
    step(slow, 1.5, constHooks(0.5));
    expect(fast.money).toBe(10); // already delivered
    expect(slow.money).toBe(0); // still driving/loading
  });
});

describe("end to end: lay → sweep → deposit → scheduled truck → payout", () => {
  it("turns a chicken egg into $10 and a feather", () => {
    const s = createSim(); // 2 chickens laying for real
    const hooks = constHooks(0.5);
    let target: Egg | null = null;

    // wait for the first egg and vacuum at its position until swept
    for (let i = 0; i < 60 * 8 && !target; i++) {
      tick(s, 1 / 60, hooks);
      const g = s.ground[0] ?? s.falling[0];
      if (g) {
        sweepCollect(s, g.x, g.y, g.x, g.y);
        if (g.phase === "flying") target = g;
      }
    }
    expect(target, "an egg should get swept within 8s").not.toBeNull();

    s.counts = [0, 0, 0, 0, 0]; // freeze laying so the payout stays exact
    step(s, 0.5, hooks); // finish the flight
    expect(s.baskets[0].count).toBe(1);
    expect(s.baskets[0].value).toBe(10);

    s.n.ttime = 1; // 30s schedule
    step(s, 33, hooks); // 30s gate + drive + load
    expect(s.money).toBe(10);
    expect(s.feathers).toBe(1);
    expect(s.totalDelivered).toBe(1);
    expect(s.baskets[0].count).toBe(0);
  });
});

describe("countdown display helper", () => {
  it("counts down whole seconds and hides when full or moving", () => {
    const s = quietSim();
    s.n.ttime = 1;
    s.baskets[0].count = 1;
    expect(truckCountdown(s, s.baskets[0])).toBe(30);
    step(s, 12.5, constHooks(0.5));
    expect(truckCountdown(s, s.baskets[0])).toBe(18); // ceil(30 - 12.5)
    s.baskets[0].count = 12;
    expect(truckCountdown(s, s.baskets[0])).toBeNull(); // full → dispatching
  });
});

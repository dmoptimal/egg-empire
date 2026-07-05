// Species gimmicks + milestone toasts (fun pass, Dan's backlog 2026-07-05).
// Quail burst-lay, goose fresh-shine, ostrich rollers, one-shot milestones.

import { describe, expect, it } from "vitest";
import {
  GOOSE_SHINE_TIME,
  QUAIL_CLUSTER_SIZE,
} from "../config/species";
import { sweepCollect } from "./collect";
import { drainEvents } from "./events";
import { restore, serialize } from "./save";
import { createSim } from "./state";
import { constHooks, forgeGroundEgg, step } from "./test-helpers";
import type { SimEvent } from "./types";

function quiet() {
  const s = createSim();
  s.counts = [0, 0, 0, 0, 0];
  return s;
}

const laidEggs = (evs: SimEvent[]) =>
  evs.filter((e): e is Extract<SimEvent, { type: "egg-laid" }> => e.type === "egg-laid");

describe("quail bursts", () => {
  it("a lucky lay drops a whole cluster, landing together", () => {
    const s = quiet();
    s.n.sp2 = 1;
    s.counts[2] = 1;
    step(s, 1.7, constHooks(0.1)); // rng 0.1 < cluster chance → burst
    const laid = laidEggs(drainEvents(s));
    expect(laid).toHaveLength(QUAIL_CLUSTER_SIZE);
    const first = laid[0].egg;
    for (const { egg } of laid.slice(1)) {
      expect(Math.abs(egg.x - first.x)).toBeLessThan(40);
      expect(Math.abs(egg.targetY - first.targetY)).toBeLessThan(30);
    }
  });

  it("an unlucky roll lays a single egg like anyone else", () => {
    const s = quiet();
    s.n.sp2 = 1;
    s.counts[2] = 1;
    step(s, 1.7, constHooks(0.5)); // 0.5 > cluster chance
    expect(laidEggs(drainEvents(s))).toHaveLength(1);
  });
});

describe("goose shine", () => {
  it("sweeping a fresh goose egg pays +50%", () => {
    const s = quiet();
    const fresh = forgeGroundEgg(s, { x: 100, y: 400, species: 3, value: 100, age: 2 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(fresh.value).toBe(150);
  });

  it("a stale goose egg pays face value", () => {
    const s = quiet();
    const stale = forgeGroundEgg(s, {
      x: 100, y: 400, species: 3, value: 100, age: GOOSE_SHINE_TIME + 1,
    });
    sweepCollect(s, 100, 400, 100, 400);
    expect(stale.value).toBe(100);
  });

  it("other species never shine", () => {
    const s = quiet();
    const hen = forgeGroundEgg(s, { x: 100, y: 400, species: 0, value: 100, age: 1 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(hen.value).toBe(100);
  });
});

describe("ostrich rollers", () => {
  it("ostrich eggs land rolling and coast to a stop", () => {
    const s = quiet();
    s.n.sp4 = 1;
    s.counts[4] = 1;
    step(s, 14.2, constHooks(0.5));
    const laid = laidEggs(drainEvents(s));
    expect(laid).toHaveLength(1);
    const egg = laid[0].egg;
    expect(egg.vx).toBeCloseTo(55); // 30 + 0.5×50, positive on a 0.5 roll
    const x0 = egg.x;
    step(s, 4, constHooks(0.5)); // land, roll, drag to a halt
    expect(egg.phase).toBe("ground");
    expect(egg.vx).toBe(0);
    expect(egg.x).toBeGreaterThan(x0 + 15);
  });

  it("sweeping a ROLLING egg smashes the neighbourhood into the baskets", () => {
    const s = quiet();
    const roller = forgeGroundEgg(s, { x: 200, y: 450, species: 4, value: 100, vx: 50 });
    const near = forgeGroundEgg(s, { x: 255, y: 450 }); // outside the 46px sweep, inside 70
    const far = forgeGroundEgg(s, { x: 280, y: 450 }); // outside the smash radius
    sweepCollect(s, 200, 450, 200, 450);
    expect(roller.phase).toBe("flying");
    expect(near.phase).toBe("flying");
    expect(far.phase).toBe("ground");
    const evs = drainEvents(s);
    const strike = evs.find((e): e is Extract<SimEvent, { type: "strike" }> => e.type === "strike")!;
    expect(strike.count).toBe(1);
  });

  it("a stopped ostrich egg is just a big egg", () => {
    const s = quiet();
    forgeGroundEgg(s, { x: 200, y: 450, species: 4, value: 100, vx: 0 });
    const near = forgeGroundEgg(s, { x: 255, y: 450 });
    sweepCollect(s, 200, 450, 200, 450);
    expect(near.phase).toBe("ground");
    expect(drainEvents(s).some((e) => e.type === "strike")).toBe(false);
  });
});

describe("lifetime stats", () => {
  it("count banked eggs and survive a save round-trip", () => {
    const s = quiet();
    forgeGroundEgg(s, { x: 100, y: 400, value: 10 });
    sweepCollect(s, 100, 400, 100, 400);
    step(s, 1.5, constHooks(0.5)); // flight lands in the basket
    expect(s.stats.eggs).toBe(1);
    const back = restore(serialize(s, 0))!;
    expect(back.stats.eggs).toBe(1);
  });
});

describe("milestones", () => {
  it("delivered milestones fire once each, spaced out, and persist", () => {
    const s = quiet();
    s.totalDelivered = 1500;
    step(s, 0.1, constHooks(0.5));
    let ids = drainEvents(s).filter((e) => e.type === "milestone").map((e) => "id" in e && e.id);
    expect(ids).toEqual(["delivered_100"]); // one per gap, never a stack
    step(s, 4.2, constHooks(0.5));
    ids = drainEvents(s).filter((e) => e.type === "milestone").map((e) => "id" in e && e.id);
    expect(ids).toEqual(["delivered_1000"]);
    const back = restore(serialize(s, 0))!;
    expect(back.milestones.delivered_100).toBe(1);
    step(back, 5, constHooks(0.5));
    expect(drainEvents(back).some((e) => e.type === "milestone")).toBe(false);
  });

  it("meeting a new species introduces its gimmick", () => {
    const s = quiet();
    s.n.sp2 = 1;
    s.counts[2] = 1;
    step(s, 0.1, constHooks(0.5));
    const evs = drainEvents(s);
    expect(evs.some((e) => e.type === "milestone" && e.id === "quail_intro")).toBe(true);
  });
});

// PLAN.md Phase 3 — one vitest per new support node's sim effect.

import { describe, expect, it } from "vitest";
import { EGG_CAP } from "../config/species";
import { sweepCollect } from "./collect";
import { birdCost, eggCap, eggLife, sweepRadius } from "./economy";
import { drainEvents } from "./events";
import { createSim } from "./state";
import { constHooks, forgeGroundEgg, step } from "./test-helpers";
import { tick } from "./tick";

function quiet() {
  const s = createSim();
  s.counts = [0, 0, 0, 0, 0];
  return s;
}

describe("ecap — Roomier hay", () => {
  it("raises the ground cap by 20 per level, to 160 at max", () => {
    const s = createSim();
    expect(eggCap(s)).toBe(EGG_CAP);
    s.n.ecap = 4;
    expect(eggCap(s)).toBe(160);
  });

  it("the flooded field actually holds more eggs", () => {
    const s = createSim();
    s.n.sp2 = 1;
    s.n.ecap = 4;
    s.counts = [0, 0, 100, 0, 0];
    step(s, 4, constHooks(0.5));
    const onField = s.ground.length + s.falling.length;
    expect(onField).toBeGreaterThan(EGG_CAP);
    expect(onField).toBeLessThanOrEqual(160);
  });
});

describe("espoil — Fresh eggs", () => {
  it("adds +5s spoil time per level", () => {
    const s = createSim();
    expect(eggLife(s)).toBe(25);
    s.n.espoil = 4;
    expect(eggLife(s)).toBe(45);
  });

  it("an egg past base life survives with the node", () => {
    const s = quiet();
    s.n.espoil = 1; // 30s life
    forgeGroundEgg(s, { x: 100, y: 400, age: 26 });
    step(s, 2, constHooks(0.5)); // age ≈ 28 < 30
    expect(s.ground).toHaveLength(1);
    step(s, 3, constHooks(0.5)); // age ≈ 31 > 30
    expect(s.ground).toHaveLength(0);
    expect(drainEvents(s).filter((e) => e.type === "egg-spoiled")).toHaveLength(1);
  });
});

describe("sweep — Wider sweep", () => {
  it("adds +8px radius per level", () => {
    const s = createSim();
    expect(sweepRadius(s)).toBe(46);
    s.n.sweep = 3;
    expect(sweepRadius(s)).toBe(70);
  });

  it("reaches an egg the base radius misses", () => {
    const s = quiet();
    const egg = forgeGroundEgg(s, { x: 100, y: 450 }); // 50px from the tap
    sweepCollect(s, 100, 400, 100, 400);
    expect(egg.phase).toBe("ground"); // 50 > 46
    s.n.sweep = 1; // radius 54
    sweepCollect(s, 100, 400, 100, 400);
    expect(egg.phase).toBe("flying");
  });
});

describe("combo — Hot streak", () => {
  it("boosts eggs swept within the streak window, not the opener", () => {
    const s = quiet();
    s.n.combo = 2; // +10%
    const a = forgeGroundEgg(s, { x: 100, y: 400, value: 10 });
    const b = forgeGroundEgg(s, { x: 300, y: 400, value: 10 });
    sweepCollect(s, 100, 400, 100, 400); // opener: comboT was cold
    expect(a.value).toBe(10);
    tick(s, 0.2, constHooks(0.5)); // 0.2s later — inside the 0.45s window
    sweepCollect(s, 300, 400, 300, 400);
    expect(b.value).toBe(11); // round(10 × 1.10)
  });

  it("a cold gap resets the streak", () => {
    const s = quiet();
    s.n.combo = 3;
    forgeGroundEgg(s, { x: 100, y: 400, value: 10 });
    const late = forgeGroundEgg(s, { x: 300, y: 400, value: 10 });
    sweepCollect(s, 100, 400, 100, 400);
    step(s, 1, constHooks(0.5)); // > 0.45s
    sweepCollect(s, 300, 400, 300, 400);
    expect(late.value).toBe(10);
  });
});

describe("gold2 — Midas flock", () => {
  it("swept golden eggs drop a bonus feather instantly", () => {
    const s = quiet();
    s.n.gold2 = 1;
    forgeGroundEgg(s, { x: 100, y: 400, golden: true, value: 100 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(s.feathers).toBe(1);
  });

  it("plain eggs and locked node pay nothing extra", () => {
    const s = quiet();
    forgeGroundEgg(s, { x: 100, y: 400, golden: true, value: 100 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(s.feathers).toBe(0);
  });
});

describe("birdlot — Bulk deals", () => {
  it("flattens bird cost growth by 0.02 per level for every species", () => {
    const s = createSim();
    s.counts[0] = 3; // next chicken: floor(50 × growth^1)
    expect(birdCost(s, 0)).toBe(67); // 1.35
    s.n.birdlot = 3;
    expect(birdCost(s, 0)).toBe(Math.floor(50 * 1.29));
    s.n.sp4 = 1;
    s.counts[4] = 2;
    expect(birdCost(s, 4)).toBe(Math.floor(16000000 * (1.45 - 0.06)));
  });
});

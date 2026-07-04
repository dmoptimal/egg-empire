// Collector behaviour: seek → bag → carry → deposit, bag-size chaining,
// Gentle Hands value bonus, and losing a target to spoilage.

import { describe, expect, it } from "vitest";
import { addCollector } from "./collectors";
import { drainEvents } from "./events";
import { createSim } from "./state";
import { constHooks, forgeGroundEgg, step } from "./test-helpers";

function simWithCollector() {
  const s = createSim(); // basket0.x 338, hayBottom 583; collector at (298, 583)
  s.counts = [0, 0, 0, 0, 0];
  addCollector(s);
  return s;
}

describe("collectors", () => {
  it("spawns beside the first basket", () => {
    const s = simWithCollector();
    expect(s.collectors[0].x).toBe(298);
    expect(s.collectors[0].y).toBe(583);
  });

  it("seeks the nearest egg, bags it, and deposits into a basket", () => {
    const s = simWithCollector();
    forgeGroundEgg(s, { x: 298, y: 483, value: 10 }); // 100px above
    step(s, 3, constHooks(0.5));
    const evs = drainEvents(s);
    expect(evs.filter((e) => e.type === "egg-picked-up")).toHaveLength(1);
    expect(s.baskets[0].count).toBe(1);
    expect(s.baskets[0].value).toBe(10);
    expect(s.baskets[0].feathers).toBe(1);
    expect(s.collectors[0].mode).toBe("idle");
    expect(s.collectors[0].bag).toHaveLength(0);
    expect(s.ground).toHaveLength(0);
  });

  it("targets the nearest free egg first", () => {
    const s = simWithCollector();
    const far = forgeGroundEgg(s, { x: 100, y: 400 });
    const near = forgeGroundEgg(s, { x: 290, y: 560 });
    step(s, 1 / 60, constHooks(0.5)); // one tick: idle → seek
    expect(s.collectors[0].target).toBe(near);
    expect(near.claimed).toBe(true);
    expect(far.claimed).toBe(false);
  });

  it("chains pickups up to the bag cap before carrying", () => {
    const s = simWithCollector();
    s.n.cbag = 2; // bag cap 3
    forgeGroundEgg(s, { x: 300, y: 500 });
    forgeGroundEgg(s, { x: 310, y: 500 });
    forgeGroundEgg(s, { x: 320, y: 500 });
    step(s, 5, constHooks(0.5));
    expect(s.baskets[0].count).toBe(3);
    expect(s.baskets[0].value).toBe(30);
    expect(s.ground).toHaveLength(0);
  });

  it("applies Gentle Hands at pickup", () => {
    const s = simWithCollector();
    s.n.cval = 3; // ×1.3
    forgeGroundEgg(s, { x: 298, y: 500, value: 10 });
    step(s, 3, constHooks(0.5));
    expect(s.baskets[0].value).toBe(13); // round(10 * 1.3)
  });

  it("golden bag eggs pay golden feathers at deposit", () => {
    const s = simWithCollector();
    forgeGroundEgg(s, { x: 298, y: 500, value: 100, golden: true });
    step(s, 3, constHooks(0.5));
    expect(s.baskets[0].feathers).toBe(15);
  });

  it("returns to idle when its claimed egg spoils mid-walk", () => {
    const s = simWithCollector();
    forgeGroundEgg(s, { x: 24, y: 366, age: 24.5 }); // far away, nearly spoiled
    step(s, 2, constHooks(0.5));
    const evs = drainEvents(s);
    expect(evs.filter((e) => e.type === "egg-spoiled")).toHaveLength(1);
    expect(evs.filter((e) => e.type === "egg-picked-up")).toHaveLength(0);
    expect(s.collectors[0].mode).toBe("idle");
    expect(s.collectors[0].target).toBeNull();
    expect(s.baskets[0].count).toBe(0);
  });
});

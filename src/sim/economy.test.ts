// Cost curves and derived economy values under the PLAN.md Phase 0
// era-indexed economy. These tests pin the WIRING (config → sim); the
// pacing tests in pacing.test.ts are the spec for the numbers themselves.

import { describe, expect, it } from "vitest";
import {
  BASKET_COSTS,
  costTierMult,
  FARM_NODE_COSTS,
  FEATHERS_BY_TIER,
  HIRE_COSTS,
  SPECIES_NODE_COSTS,
  WORTH_PER_LVL,
} from "../config/economy";
import { nodeById } from "../config/nodes";
import { SPECIES } from "../config/species";
import {
  basketCap,
  birdCost,
  collBagCap,
  collSpeed,
  collValueMult,
  featherGolden,
  featherPerEgg,
  goldenPct,
  layIntv,
  totalBirds,
  truckPause,
  truckSchedule,
  truckSpeedIn,
  truckSpeedOut,
  worthMult,
} from "./economy";
import { createSim } from "./state";
import { nodeCost } from "./tree";

describe("species table (PLAN Phase 0 era ladder)", () => {
  it("egg values steepen ~×30 per tier", () => {
    expect(SPECIES.map((sp) => sp.eggValue)).toEqual([10, 300, 9000, 250000, 8000000]);
  });
  it("unlocks and bird bases follow the Phase 0 table", () => {
    expect(SPECIES.map((sp) => sp.unlock)).toEqual([0, 2500, 150000, 8000000, 400000000]);
    expect(SPECIES.map((sp) => sp.birdBase)).toEqual([50, 600, 18000, 500000, 16000000]);
  });
});

describe("bird cost curve", () => {
  it("prices the 3rd chicken at base (you start with 2)", () => {
    const s = createSim();
    expect(birdCost(s, 0)).toBe(50);
  });

  it("grows chicken cost by 1.35^owned past the freebies", () => {
    const s = createSim();
    s.counts[0] = 3;
    expect(birdCost(s, 0)).toBe(67); // floor(50 * 1.35)
    s.counts[0] = 10;
    expect(birdCost(s, 0)).toBe(551); // floor(50 * 1.35^8)
  });

  it("prices first birds at their era-indexed base", () => {
    const s = createSim();
    s.counts = [2, 1, 1, 1, 1];
    expect(birdCost(s, 1)).toBe(600);
    expect(birdCost(s, 2)).toBe(18000);
    expect(birdCost(s, 3)).toBe(500000);
    expect(birdCost(s, 4)).toBe(16000000);
  });

  it("uses per-species growth (duck 1.35, ostrich 1.45)", () => {
    const s = createSim();
    s.counts[1] = 2;
    expect(birdCost(s, 1)).toBe(810); // floor(600 * 1.35)
    s.counts[4] = 2;
    expect(birdCost(s, 4)).toBe(23200000); // floor(16M * 1.45)
  });
});

describe("node cost wiring", () => {
  const s = createSim();

  it("species nodes cost their unlock price", () => {
    expect(nodeCost(s, nodeById.sp0)).toBe(0);
    expect(nodeCost(s, nodeById.sp1)).toBe(2500);
    expect(nodeCost(s, nodeById.sp2)).toBe(150000);
    expect(nodeCost(s, nodeById.sp3)).toBe(8000000);
    expect(nodeCost(s, nodeById.sp4)).toBe(400000000);
  });

  it("species branches: base × 12^(tier−1) × growth^lvl", () => {
    const { w, g } = SPECIES_NODE_COSTS;
    expect(nodeById.w0.cost(0)).toBe(w.base);
    expect(nodeById.w4.cost(0)).toBe(Math.ceil(w.base * costTierMult(5))); // 1.0368M
    expect(nodeById.w4.cost(0)).toBe(1036800);
    expect(nodeById.g0.cost(0)).toBe(g.base);
    expect(nodeById.w0.cost(3)).toBe(Math.ceil(w.base * Math.pow(w.growth, 3)));
    expect(nodeById.s2.cost(1)).toBe(
      Math.ceil(SPECIES_NODE_COSTS.s.base * costTierMult(3) * SPECIES_NODE_COSTS.s.growth),
    );
  });

  it("farm/collector branches read FARM_NODE_COSTS", () => {
    expect(nodeById.bsize.cost(0)).toBe(FARM_NODE_COSTS.bsize.base);
    expect(nodeById.coll.cost(0)).toBe(FARM_NODE_COSTS.coll.base);
    expect(nodeById.tspd.cost(0)).toBe(FARM_NODE_COSTS.tspd.base);
    expect(nodeById.fth.cost(4)).toBe(
      Math.ceil(FARM_NODE_COSTS.fth.base * Math.pow(FARM_NODE_COSTS.fth.growth, 4)),
    );
  });

  it("money nodes read their per-level price arrays", () => {
    BASKET_COSTS.forEach((c, l) => expect(nodeById.bextra.cost(l)).toBe(c));
    HIRE_COSTS.forEach((c, l) => expect(nodeById.hire.cost(l)).toBe(c));
  });
});

describe("derived multipliers", () => {
  it("worth ×1.5 per level (Phase 0)", () => {
    const s = createSim();
    expect(WORTH_PER_LVL).toBe(1.5);
    expect(worthMult(s, 0)).toBe(1);
    s.n.w0 = 3;
    expect(worthMult(s, 0)).toBeCloseTo(3.375, 10);
    s.n.w0 = 5;
    expect(worthMult(s, 0)).toBeCloseTo(7.59375, 10); // ×7.6 at max
  });

  it("lay interval ×0.90 per level", () => {
    const s = createSim();
    expect(layIntv(s, 0)).toBe(4);
    s.n.s0 = 2;
    expect(layIntv(s, 0)).toBeCloseTo(3.24, 10);
    expect(layIntv(s, 2)).toBeCloseTo(1.6, 10); // quail untouched
  });

  it("golden chance 2% base +2% per level", () => {
    const s = createSim();
    expect(goldenPct(s, 0)).toBeCloseTo(0.02, 10);
    s.n.g0 = 5;
    expect(goldenPct(s, 0)).toBeCloseTo(0.12, 10);
  });

  it("basket capacity 12 + 8 per level", () => {
    const s = createSim();
    expect(basketCap(s)).toBe(12);
    s.n.bsize = 5;
    expect(basketCap(s)).toBe(52);
  });

  it("truck speed ×1.3 and pause ×0.92 per level", () => {
    const s = createSim();
    expect(truckSpeedIn(s)).toBe(300);
    expect(truckSpeedOut(s)).toBe(340);
    expect(truckPause(s)).toBeCloseTo(0.9, 10);
    s.n.tspd = 2;
    expect(truckSpeedIn(s)).toBeCloseTo(507, 10);
    expect(truckSpeedOut(s)).toBeCloseTo(574.6, 10);
    expect(truckPause(s)).toBeCloseTo(0.76176, 10);
  });

  it("truck schedule table 20/14/9/6/4s, 0 = locked", () => {
    const s = createSim();
    const expected = [0, 20, 14, 9, 6, 4];
    for (let l = 0; l <= 5; l++) {
      s.n.ttime = l;
      expect(truckSchedule(s)).toBe(expected[l]);
    }
  });

  it("feathers per egg: tier base × (1 + Feathered Eggs level)", () => {
    const s = createSim();
    expect(FEATHERS_BY_TIER).toHaveLength(SPECIES.length);
    expect(featherPerEgg(s, 0)).toBe(1);
    expect(featherPerEgg(s, 2)).toBe(FEATHERS_BY_TIER[2]);
    expect(featherGolden(s, 0)).toBe(15);
    expect(featherGolden(s, 3)).toBe(15 * FEATHERS_BY_TIER[3]);
    s.n.fth = 5;
    expect(featherPerEgg(s, 0)).toBe(6);
    expect(featherGolden(s, 4)).toBe(15 * FEATHERS_BY_TIER[4] * 6);
  });

  it("collector speed / bag / gentle hands", () => {
    const s = createSim();
    expect(collSpeed(s)).toBe(130);
    expect(collBagCap(s)).toBe(1);
    expect(collValueMult(s)).toBe(1);
    s.n.cspd = 1;
    s.n.cbag = 5;
    s.n.cval = 5;
    expect(collSpeed(s)).toBeCloseTo(162.5, 10);
    expect(collBagCap(s)).toBe(6);
    expect(collValueMult(s)).toBeCloseTo(1.5, 10);
  });

  it("counts birds across species", () => {
    const s = createSim();
    expect(totalBirds(s)).toBe(2);
    s.counts = [3, 1, 0, 2, 0];
    expect(totalBirds(s)).toBe(6);
  });
});

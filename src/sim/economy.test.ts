// Cost curves and derived economy values, pinned to the prototype's numbers.
// Every expectation here was computed from the formulas in
// prototype/egg-empire.html — if one fails, the port drifted.

import { describe, expect, it } from "vitest";
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

  it("prices the first duck at base and the second at ×1.35", () => {
    const s = createSim();
    s.counts[1] = 1;
    expect(birdCost(s, 1)).toBe(500);
    s.counts[1] = 2;
    expect(birdCost(s, 1)).toBe(675);
  });

  it("uses per-species growth (goose 1.40, ostrich 1.45)", () => {
    const s = createSim();
    s.counts[3] = 2;
    expect(birdCost(s, 3)).toBe(Math.floor(20000 * 1.4));
    s.counts[4] = 2;
    expect(birdCost(s, 4)).toBe(362500); // floor(250000 * 1.45)
  });
});

describe("node cost curves", () => {
  const s = createSim();

  it("species nodes cost their unlock price", () => {
    expect(nodeCost(s, nodeById.sp0)).toBe(0);
    expect(nodeCost(s, nodeById.sp1)).toBe(2500);
    expect(nodeCost(s, nodeById.sp2)).toBe(30000);
    expect(nodeCost(s, nodeById.sp3)).toBe(450000);
    expect(nodeCost(s, nodeById.sp4)).toBe(7500000);
  });

  it("worth: ceil(8 · tier · 2.1^lvl)", () => {
    expect(nodeById.w0.cost(0)).toBe(8);
    expect(nodeById.w0.cost(4)).toBe(156); // ceil(8 * 2.1^4)
    expect(nodeById.w4.cost(0)).toBe(40); // ostrich worth L1 = 40 feathers
  });

  it("lay speed: ceil(12 · tier · 2.2^lvl)", () => {
    expect(nodeById.s0.cost(0)).toBe(12);
    expect(nodeById.s2.cost(1)).toBe(Math.ceil(12 * 3 * 2.2));
  });

  it("golden: ceil(15 · tier · 2.4^lvl)", () => {
    expect(nodeById.g0.cost(0)).toBe(15);
    expect(nodeById.g4.cost(2)).toBe(Math.ceil(15 * 5 * Math.pow(2.4, 2)));
  });

  it("farm branch curves", () => {
    expect(nodeById.bsize.cost(0)).toBe(25);
    expect(nodeById.bsize.cost(4)).toBe(Math.ceil(25 * Math.pow(2.5, 4)));
    expect(nodeById.bextra.cost(0)).toBe(15000);
    expect(nodeById.bextra.cost(1)).toBe(400000);
    expect(nodeById.bextra.cost(2)).toBe(10000000);
    expect(nodeById.tspd.cost(0)).toBe(30);
    expect(nodeById.ttime.cost(0)).toBe(35);
  });

  it("collector branch curves", () => {
    expect(nodeById.coll.cost(0)).toBe(150);
    expect(nodeById.hire.cost(0)).toBe(5000);
    expect(nodeById.hire.cost(4)).toBe(1280000); // 5000 * 4^4
    expect(nodeById.cspd.cost(0)).toBe(40);
    expect(nodeById.cbag.cost(0)).toBe(45);
    expect(nodeById.cval.cost(4)).toBe(1825); // ceil(55 * 2.4^4)
    expect(nodeById.fth.cost(0)).toBe(60);
  });
});

describe("derived multipliers", () => {
  it("worth ×1.25 per level", () => {
    const s = createSim();
    expect(worthMult(s, 0)).toBe(1);
    s.n.w0 = 3;
    expect(worthMult(s, 0)).toBeCloseTo(1.953125, 10);
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

  it("basket capacity 12 + 6 per level", () => {
    const s = createSim();
    expect(basketCap(s)).toBe(12);
    s.n.bsize = 5;
    expect(basketCap(s)).toBe(42);
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

  it("truck schedule table 30/24/18/14/10s, 0 = locked", () => {
    const s = createSim();
    const expected = [0, 30, 24, 18, 14, 10];
    for (let l = 0; l <= 5; l++) {
      s.n.ttime = l;
      expect(truckSchedule(s)).toBe(expected[l]);
    }
  });

  it("collector speed / bag / gentle hands / feathers", () => {
    const s = createSim();
    expect(collSpeed(s)).toBe(130);
    expect(collBagCap(s)).toBe(1);
    expect(collValueMult(s)).toBe(1);
    expect(featherPerEgg(s)).toBe(1);
    expect(featherGolden(s)).toBe(15);
    s.n.cspd = 1;
    s.n.cbag = 5;
    s.n.cval = 5;
    s.n.fth = 5;
    expect(collSpeed(s)).toBeCloseTo(162.5, 10);
    expect(collBagCap(s)).toBe(6);
    expect(collValueMult(s)).toBeCloseTo(1.5, 10);
    expect(featherPerEgg(s)).toBe(6);
    expect(featherGolden(s)).toBe(65);
  });

  it("counts birds across species", () => {
    const s = createSim();
    expect(totalBirds(s)).toBe(2);
    s.counts = [3, 1, 0, 2, 0];
    expect(totalBirds(s)).toBe(6);
  });

  it("species table matches the prototype", () => {
    expect(SPECIES.map((sp) => sp.eggValue)).toEqual([10, 60, 300, 2600, 30000]);
    expect(SPECIES.map((sp) => sp.interval)).toEqual([4, 5, 1.6, 8, 14]);
  });
});

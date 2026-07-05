// PLAN.md Phase 0 §3 — time-to-afford pacing. These bands ARE the balance
// spec: tune src/config/economy.ts until they pass, and they guard every
// later phase against pacing regressions. Failures print one line per
// violation with the computed seconds, which is the tuning worksheet.

import { describe, expect, it } from "vitest";
import { CHECKPOINTS, PACING_BANDS } from "../config/economy";
import { NODES, nodeById } from "../config/nodes";
import { lvl } from "./economy";
import { checkpointSim, featherRate, moneyRate } from "./pacing";
import type { SimState } from "./types";

const cpById = Object.fromEntries(CHECKPOINTS.map((c) => [c.id, c]));
const simCache = new Map<string, SimState>();
const simFor = (era: string): SimState => {
  let s = simCache.get(era);
  if (!s) {
    s = checkpointSim(cpById[era]);
    simCache.set(era, s);
  }
  return s;
};

/**
 * The era whose income each node's pricing is judged against — species
 * branches belong to their species' era; support branches to the era their
 * chain typically opens in real play.
 */
const NODE_ERA: Record<string, string> = {
  w0: "fresh", s0: "fresh", g0: "fresh",
  w1: "ducks", s1: "ducks", g1: "ducks",
  w2: "quail", s2: "quail", g2: "quail",
  w3: "goose", s3: "goose", g3: "goose",
  w4: "ostrich", s4: "ostrich", g4: "ostrich",
  bsize: "ducks", coll: "ducks",
  tspd: "quail", ttime: "quail", cspd: "quail",
  cbag: "goose", cval: "goose",
  fth: "ostrich",
  // Phase 3 support nodes
  ecap: "quail", sweep: "quail", combo: "quail",
  espoil: "goose", gold2: "goose", birdlot: "goose",
  // Kitchen stations (money): each lands in its own era
  st_boil: "ducks", st_fry: "quail", st_scr: "goose", st_poa: "ostrich",
  // Kitchen support nodes (feathers)
  pantry: "quail", ckspd: "quail", ckval: "goose", counter: "goose", chefs2: "ostrich",
  rush: "quail",
};

/** Money nodes are one big purchase per level, each landing in its own era. */
const MONEY_LEVEL_ERAS: Record<string, string[]> = {
  bextra: ["ducks", "quail", "goose"],
  hire: ["ducks", "quail", "goose", "ostrich", "ostrich"],
};

/** Species unlocks are judged against the PREVIOUS era's money income. */
const UNLOCK_ERAS: Record<string, string> = {
  sp1: "fresh", sp2: "ducks", sp3: "quail", sp4: "goose",
  kitchen: "ducks", // the gate should land like a species unlock (PLAN Phase 4)
  st_oml: "ostrich", // the omelette spike lands like a species unlock too
};

const secsLabel = (s: number) => `${Math.round(s)}s (${(s / 60).toFixed(1)}min)`;

describe("checkpoints are legal, reachable states", () => {
  it("every levelled node exists, respects max, and has its parent revealed", () => {
    const violations: string[] = [];
    for (const cp of CHECKPOINTS) {
      for (const [id, level] of Object.entries(cp.n)) {
        const node = nodeById[id];
        if (!node) {
          violations.push(`${cp.id}: unknown node ${id}`);
          continue;
        }
        if (level > node.max) violations.push(`${cp.id}: ${id} over max (${level}/${node.max})`);
        if (level > 0 && node.par && (cp.n[node.par] ?? 0) < 1)
          violations.push(`${cp.id}: ${id} levelled but parent ${node.par} unowned`);
      }
      cp.counts.forEach((count, i) => {
        if (count > 0 && (cp.n[`sp${i}`] ?? 0) < 1)
          violations.push(`${cp.id}: owns ${count} of locked species ${i}`);
        if ((cp.n[`sp${i}`] ?? 0) >= 1 && count < 1)
          violations.push(`${cp.id}: species ${i} unlocked but no birds`);
      });
    }
    expect(violations).toEqual([]);
  });

  it("every node is covered by a pacing band", () => {
    const covered = new Set([
      ...Object.keys(NODE_ERA),
      ...Object.keys(MONEY_LEVEL_ERAS),
      ...Object.keys(UNLOCK_ERAS),
      "sp0", // starter node, costs 0
    ]);
    expect(NODES.filter((n) => !covered.has(n.id)).map((n) => n.id)).toEqual([]);
  });
});

describe("first level of a newly revealed node costs 1-3 minutes", () => {
  it("feather/species branch nodes", () => {
    const [min, max] = PACING_BANDS.firstLevel;
    const violations: string[] = [];
    for (const [id, era] of Object.entries(NODE_ERA)) {
      const node = nodeById[id];
      const s = simFor(era);
      const rate = node.cur === "money" ? moneyRate(s) : featherRate(s);
      const level = lvl(s, id); // next purchasable level at this checkpoint
      const secs = node.cost(level) / rate;
      if (secs < min || secs > max)
        violations.push(`${id}@${era} L${level + 1}: ${secsLabel(secs)}`);
    }
    expect(violations).toEqual([]);
  });

  it("money nodes, level by level across their eras", () => {
    const [min, max] = PACING_BANDS.firstLevel;
    const violations: string[] = [];
    for (const [id, eras] of Object.entries(MONEY_LEVEL_ERAS)) {
      const node = nodeById[id];
      eras.forEach((era, level) => {
        const secs = node.cost(level) / moneyRate(simFor(era));
        if (secs < min || secs > max)
          violations.push(`${id} L${level + 1}@${era}: ${secsLabel(secs)}`);
      });
    }
    expect(violations).toEqual([]);
  });
});

describe("maxing a branch costs 20-40 minutes cumulative", () => {
  it("all multi-level feather branches", () => {
    const [min, max] = PACING_BANDS.branchTotal;
    const violations: string[] = [];
    for (const [id, era] of Object.entries(NODE_ERA)) {
      const node = nodeById[id];
      // Two-level ladders can't span 20-40 minutes without absurd L2 prices;
      // the cumulative band applies to ladders of 3+ (gold2/chefs2 exempt).
      if (node.max < 3) continue;
      let total = 0;
      for (let l = 0; l < node.max; l++) total += node.cost(l);
      const s = simFor(era);
      const rate = node.cur === "money" ? moneyRate(s) : featherRate(s);
      const secs = total / rate;
      if (secs < min || secs > max) violations.push(`${id}@${era}: ${secsLabel(secs)}`);
    }
    expect(violations).toEqual([]);
  });
});

describe("full-tree completion lands in 3-5 hours of active play", () => {
  // Model: a level's cost is paid at its band era for the FIRST level and one
  // era later for the rest (players clean branches up after income grows).
  // Money and feathers accrue in parallel, so each era costs max(m, f) time.
  it("estimated completion time is within the target band", () => {
    const ORDER = ["fresh", "ducks", "quail", "goose", "ostrich"];
    const later = (era: string): string => ORDER[Math.min(ORDER.indexOf(era) + 1, ORDER.length - 1)];
    const money = new Map<string, number>(ORDER.map((e) => [e, 0]));
    const feathers = new Map<string, number>(ORDER.map((e) => [e, 0]));
    const charge = (cur: "money" | "feathers", era: string, amount: number): void => {
      const m = cur === "money" ? money : feathers;
      m.set(era, m.get(era)! + amount);
    };
    for (const [id, era] of Object.entries(NODE_ERA)) {
      const node = nodeById[id];
      for (let l = 0; l < node.max; l++) charge(node.cur, l === 0 ? era : later(era), node.cost(l));
    }
    for (const [id, eras] of Object.entries(MONEY_LEVEL_ERAS)) {
      const node = nodeById[id];
      eras.forEach((era, l) => charge(node.cur, era, node.cost(l)));
    }
    for (const [id, era] of Object.entries(UNLOCK_ERAS)) charge(nodeById[id].cur, era, nodeById[id].cost(0));
    let total = 0;
    const perEra: string[] = [];
    for (const era of ORDER) {
      const s = simFor(era);
      const mSec = money.get(era)! / moneyRate(s);
      const fSec = feathers.get(era)! / featherRate(s);
      const eraSec = Math.max(mSec, fSec);
      total += eraSec;
      perEra.push(`${era}: ${(eraSec / 60).toFixed(0)}min (m ${(mSec / 60).toFixed(0)} / f ${(fSec / 60).toFixed(0)})`);
    }
    const totalMin = total / 60;
    expect(
      totalMin,
      `estimated completion ${totalMin.toFixed(0)}min — ${perEra.join("; ")}`,
    ).toBeGreaterThanOrEqual(180);
    expect(totalMin, `estimated completion ${totalMin.toFixed(0)}min`).toBeLessThanOrEqual(300);
  });
});

describe("species unlocks cost 5-15 minutes of the previous era", () => {
  it("each unlock against the era before it", () => {
    const [min, max] = PACING_BANDS.speciesUnlock;
    const violations: string[] = [];
    for (const [id, era] of Object.entries(UNLOCK_ERAS)) {
      const secs = nodeById[id].cost(0) / moneyRate(simFor(era));
      if (secs < min || secs > max) violations.push(`${id}@${era}: ${secsLabel(secs)}`);
    }
    expect(violations).toEqual([]);
  });
});

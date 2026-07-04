// Skill tree: reveal states, purchase mechanics and side effects, bird
// buying, and the win condition (every node maxed).

import { describe, expect, it } from "vitest";
import { NODES, nodeById } from "../config/nodes";
import { drainEvents } from "./events";
import { createSim } from "./state";
import { buyBird, buyNode, canAfford, nodeState, treeComplete } from "./tree";

describe("reveal rule", () => {
  it("hides a node until its parent has a level", () => {
    const s = createSim();
    expect(nodeState(s, nodeById.sp0)).toBe("max"); // starter node, max 1
    expect(nodeState(s, nodeById.w0)).toBe("new"); // parent sp0 owned
    expect(nodeState(s, nodeById.s0)).toBe("hidden"); // parent w0 at 0

    s.feathers = 50;
    expect(buyNode(s, "w0")).toBe(true);
    expect(nodeState(s, nodeById.w0)).toBe("part");
    expect(nodeState(s, nodeById.s0)).toBe("new");
  });

  it("refuses to sell hidden nodes even with funds", () => {
    const s = createSim();
    s.feathers = 1e9;
    expect(buyNode(s, "s0")).toBe(false);
    expect(s.feathers).toBe(1e9);
  });
});

describe("purchases", () => {
  it("spends the right currency and increments the level", () => {
    const s = createSim();
    s.feathers = 50;
    expect(canAfford(s, nodeById.w0)).toBe(true);
    expect(buyNode(s, "w0")).toBe(true);
    expect(s.feathers).toBe(0);
    expect(s.n.w0).toBe(1);
    const evs = drainEvents(s);
    expect(evs).toContainEqual({ type: "node-bought", id: "w0", level: 1 });
  });

  it("refuses when unaffordable and when maxed", () => {
    const s = createSim();
    s.feathers = 49; // w0 level 1 costs 50
    expect(buyNode(s, "w0")).toBe(false);
    expect(s.feathers).toBe(49);
    expect(buyNode(s, "sp0")).toBe(false); // already at max 1
  });

  it("unlocking a species grants the first bird", () => {
    const s = createSim();
    s.money = 2500;
    expect(buyNode(s, "sp1")).toBe(true);
    expect(s.money).toBe(0);
    expect(s.counts[1]).toBe(1);
    expect(drainEvents(s)).toContainEqual({ type: "species-unlocked", species: 1 });
  });

  it("bextra adds a basket at the next slot leftward", () => {
    const s = createSim();
    s.n.bsize = 1; // reveal bextra
    s.money = 60000;
    expect(buyNode(s, "bextra")).toBe(true);
    expect(s.baskets).toHaveLength(2);
    expect(s.baskets.map((b) => b.x)).toEqual([338, 272]);
  });

  it("hire adds a collector beside the first basket", () => {
    const s = createSim();
    s.n.bsize = 1;
    s.n.coll = 1; // reveal hire
    s.money = 30000;
    expect(buyNode(s, "hire")).toBe(true);
    expect(s.collectors).toHaveLength(1);
    expect(s.collectors[0].x).toBe(298);
  });
});

describe("bird buying", () => {
  it("buys a bird with money and reprices the next", () => {
    const s = createSim();
    s.money = 117; // 3rd chicken 50, 4th 67
    expect(buyBird(s, 0)).toBe(true);
    expect(buyBird(s, 0)).toBe(true);
    expect(s.money).toBe(0);
    expect(s.counts[0]).toBe(4);
    expect(buyBird(s, 0)).toBe(false); // broke now
  });

  it("refuses locked species regardless of money", () => {
    const s = createSim();
    s.money = 1e9;
    expect(buyBird(s, 1)).toBe(false);
    expect(s.counts[1]).toBe(0);
  });
});

describe("win condition", () => {
  it("completes only when every node is maxed, and wins exactly once", () => {
    const s = createSim();
    expect(treeComplete(s)).toBe(false);

    for (const n of NODES) s.n[n.id] = n.max;
    s.n.fth = 4; // one level short
    expect(treeComplete(s)).toBe(false);
    expect(s.won).toBe(false);

    s.feathers = nodeById.fth.cost(4);
    expect(buyNode(s, "fth")).toBe(true);
    expect(treeComplete(s)).toBe(true);
    expect(s.won).toBe(true);
    expect(drainEvents(s).filter((e) => e.type === "won")).toHaveLength(1);
  });
});

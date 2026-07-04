// Saves + offline progress: round-trip fidelity, version/shape rejection,
// and the idle-income gates (truck schedule AND a hired collector), cap,
// and pricing multipliers.

import { describe, expect, it } from "vitest";
import { OFFLINE_CAP_SECONDS } from "../config/constants";
import { estimateOfflineIncome, restore, serialize, SAVE_VERSION } from "./save";
import { createSim } from "./state";

function playedState() {
  const s = createSim();
  s.money = 5000;
  s.feathers = 99;
  s.totalDelivered = 123;
  s.counts = [4, 2, 0, 0, 0];
  s.n = { sp0: 1, sp1: 1, w0: 3, bsize: 2, bextra: 2, coll: 1, hire: 3 };
  return s;
}

describe("serialize / restore round-trip", () => {
  it("restores the durable economy and rebuilds implied entities", () => {
    const saved = serialize(playedState(), 1234);
    expect(saved.v).toBe(SAVE_VERSION);
    expect(saved.lastSeen).toBe(1234);

    const s = restore(saved)!;
    expect(s).not.toBeNull();
    expect(s.money).toBe(5000);
    expect(s.feathers).toBe(99);
    expect(s.totalDelivered).toBe(123);
    expect(s.counts).toEqual([4, 2, 0, 0, 0]);
    expect(s.n).toEqual({ sp0: 1, sp1: 1, w0: 3, bsize: 2, bextra: 2, coll: 1, hire: 3 });
    expect(s.won).toBe(false);
    expect(s.baskets).toHaveLength(3); // 1 + bextra 2
    expect(s.baskets.map((b) => b.x)).toEqual([338, 272, 206]);
    expect(s.collectors).toHaveLength(3); // hire 3
    expect(s.ground).toHaveLength(0); // eggs are ephemeral
    expect(s.falling).toHaveLength(0);
    expect(s.layAcc.every((a) => a === 0)).toBe(true);
  });

  it("serialize copies state (later mutations don't leak into the save)", () => {
    const s = playedState();
    const saved = serialize(s, 0);
    s.counts[0] = 99;
    s.n.w0 = 5;
    expect(saved.counts[0]).toBe(4);
    expect(saved.n.w0).toBe(3);
  });

  it("rejects other versions and malformed shapes", () => {
    const good = serialize(playedState(), 0);
    expect(restore({ ...good, v: SAVE_VERSION + 1 })).toBeNull();
    expect(restore({ ...good, money: "lots" as unknown as number })).toBeNull();
    expect(restore({ ...good, counts: [1, 2, 3] })).toBeNull();
    expect(restore({ ...good, counts: [1, 2, 3, 4, NaN] })).toBeNull();
    expect(restore({ ...good, n: { w0: Infinity } })).toBeNull();
    expect(restore(null as unknown as ReturnType<typeof serialize>)).toBeNull();
  });
});

describe("offline income gating", () => {
  it("accrues nothing without a truck schedule", () => {
    const s = restore(serialize(playedState(), 0))!; // collectors, no ttime
    expect(estimateOfflineIncome(s, 3600)).toEqual({ money: 0, feathers: 0, seconds: 0 });
  });

  it("accrues nothing without a hired collector", () => {
    const s = createSim();
    s.n.ttime = 1;
    expect(estimateOfflineIncome(s, 3600)).toEqual({ money: 0, feathers: 0, seconds: 0 });
  });

  it("accrues nothing for zero or negative elapsed time", () => {
    const s = restore(serialize(idleFarm(), 0))!;
    expect(estimateOfflineIncome(s, 0).seconds).toBe(0);
    expect(estimateOfflineIncome(s, -50).seconds).toBe(0);
  });
});

function idleFarm() {
  // 2 chickens, schedule level 1, one hired collector — the minimal idle farm.
  const s = createSim();
  s.n = { sp0: 1, ttime: 1, coll: 1, hire: 1 };
  return s;
}

describe("offline income amounts", () => {
  it("pays lay rate × golden-weighted value for the elapsed time", () => {
    const s = restore(serialize(idleFarm(), 0))!;
    // 0.5 eggs/s · 100s: value/egg (10·0.98 + 100·0.02) = 11.8 → $590;
    // feathers/egg (1·0.98 + 15·0.02) = 1.28 → floor(64)
    expect(estimateOfflineIncome(s, 100)).toEqual({ money: 590, feathers: 64, seconds: 100 });
  });

  it("applies worth rounding before golden ×10 and Gentle Hands on top", () => {
    const s = restore(serialize(idleFarm(), 0))!;
    s.n.w0 = 5; // round(10·1.5⁵) = 76
    s.n.cval = 5; // ×1.5
    // (76·0.98 + 760·0.02)·1.5 = 134.52 per egg · 0.5/s · 100s = 6726
    expect(estimateOfflineIncome(s, 100).money).toBe(6726);
  });

  it("caps credited time at 8 hours", () => {
    const s = restore(serialize(idleFarm(), 0))!;
    const off = estimateOfflineIncome(s, 36 * 3600);
    expect(off.seconds).toBe(OFFLINE_CAP_SECONDS);
    expect(off.money).toBe(Math.floor(0.5 * 11.8 * OFFLINE_CAP_SECONDS));
  });
});

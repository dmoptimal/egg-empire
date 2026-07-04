// Egg lifecycle: fall physics with a single bounce, spoiling, the ground cap,
// and golden rolls/values.

import { describe, expect, it } from "vitest";
import { EGG_CAP } from "../config/species";
import { drainEvents } from "./events";
import { layEgg } from "./eggs";
import { createSim } from "./state";
import { constHooks, seqHooks, step } from "./test-helpers";

const spawnAt = (x: number, y: number) => () => ({ x, y });

describe("falling and bouncing", () => {
  it("falls under gravity, bounces once on a hard landing, then settles", () => {
    const s = createSim(); // hayTop 350, hayBottom 583
    s.counts = [0, 0, 0, 0, 0]; // no background laying
    // rng: golden roll, x jitter, targetY roll → targetY = hayTop + 14 = 364
    layEgg(s, 0, seqHooks([0.5, 0.5, 0.0], spawnAt(100, 200)));
    const egg = s.falling[0];
    expect(egg).toBeDefined();
    expect(egg.y).toBe(194); // spawn y - 6
    expect(egg.targetY).toBe(364);

    step(s, 2, constHooks(0.5), 1 / 120);
    const evs = drainEvents(s);
    expect(evs.filter((e) => e.type === "egg-bounced")).toHaveLength(1);
    expect(egg.phase).toBe("ground");
    expect(egg.y).toBe(egg.targetY);
    expect(s.ground).toContain(egg);
    expect(s.falling).toHaveLength(0);
  });

  it("soft landings settle without a bounce", () => {
    const s = createSim();
    s.counts = [0, 0, 0, 0, 0];
    // spawn right at the target: impact velocity stays under 220
    layEgg(s, 0, seqHooks([0.5, 0.5, 0.0], spawnAt(100, 370)));
    step(s, 0.5, constHooks(0.5));
    const evs = drainEvents(s);
    expect(evs.filter((e) => e.type === "egg-bounced")).toHaveLength(0);
    expect(s.ground).toHaveLength(1);
    expect(s.ground[0].bounced).toBe(false);
  });
});

describe("spoiling", () => {
  it("ground eggs spoil after EGG_LIFE seconds", () => {
    const s = createSim();
    s.counts = [0, 0, 0, 0, 0];
    layEgg(s, 0, constHooks(0.5, spawnAt(100, 360)));
    step(s, 26.5, constHooks(0.5));
    const evs = drainEvents(s);
    expect(evs.filter((e) => e.type === "egg-spoiled")).toHaveLength(1);
    expect(s.ground).toHaveLength(0);
    expect(s.falling).toHaveLength(0);
  });
});

describe("ground cap", () => {
  it("holds ground+falling at EGG_CAP by despawning the oldest", () => {
    const s = createSim();
    s.n.sp2 = 1;
    s.counts = [0, 0, 100, 0, 0]; // 62.5 eggs/s — floods the cap fast
    step(s, 3, constHooks(0.5));
    expect(s.ground.length + s.falling.length).toBe(EGG_CAP);
    const evs = drainEvents(s);
    const laid = evs.filter((e) => e.type === "egg-laid").length;
    const despawned = evs.filter((e) => e.type === "egg-despawned").length;
    expect(laid).toBeGreaterThan(EGG_CAP);
    expect(despawned).toBe(laid - EGG_CAP);
  });
});

describe("golden eggs", () => {
  it("rolls golden under the 2% base chance and rounds value before ×10", () => {
    const s = createSim();
    s.counts = [0, 0, 0, 0, 0];
    s.n.w0 = 3; // worth ×1.5³ = ×3.375 → round(33.75) = 34, then ×10
    layEgg(s, 0, seqHooks([0.019, 0.5, 0.5], spawnAt(100, 200)));
    expect(s.falling[0].golden).toBe(true);
    expect(s.falling[0].value).toBe(340);
  });

  it("stays plain at or above the threshold", () => {
    const s = createSim();
    s.counts = [0, 0, 0, 0, 0];
    layEgg(s, 0, seqHooks([0.021, 0.5, 0.5], spawnAt(100, 200)));
    expect(s.falling[0].golden).toBe(false);
    expect(s.falling[0].value).toBe(10);
  });
});

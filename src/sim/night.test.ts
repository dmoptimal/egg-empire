// Day/night + foxes (Lily's design): the clock, the roost pause, fox
// climb/steal/flee, sweep bounties, and the Night guard automation.

import { describe, expect, it } from "vitest";
import { DAY_LENGTH, FOX_BIRD_CAP, FOX_BIRD_DEPTH, GUARD_INTERVAL, NIGHT_LENGTH } from "../config/night";
import { sweepCollect } from "./collect";
import { birdCost } from "./economy";
import { drainEvents } from "./events";
import { CYCLE_LENGTH, foxBounty } from "./night";
import { createSim } from "./state";
import { constHooks, forgeGroundEgg, step } from "./test-helpers";
import type { Fox, SimState } from "./types";

function quiet() {
  const s = createSim();
  s.counts = [0, 0, 0, 0, 0];
  return s;
}

/** Flip the sim into night and swallow the transition events. */
function atNight(s: SimState): void {
  s.clock.t = DAY_LENGTH;
  step(s, 0.05, constHooks(0.5));
  drainEvents(s);
}

function forgeFox(s: SimState, y: number, x = 200): Fox {
  const f: Fox = { id: s.foxSeq++, x, y, state: "climb", carrying: false };
  s.foxes.push(f);
  return f;
}

describe("the clock", () => {
  it("sun sets after DAY_LENGTH and rises NIGHT_LENGTH later", () => {
    const s = quiet();
    s.clock.t = DAY_LENGTH - 1;
    step(s, 2, constHooks(0.5));
    expect(s.clock.night).toBe(true);
    expect(drainEvents(s).some((e) => e.type === "nightfall")).toBe(true);
    step(s, NIGHT_LENGTH, constHooks(0.5));
    expect(s.clock.night).toBe(false);
    expect(drainEvents(s).some((e) => e.type === "daybreak")).toBe(true);
    expect(CYCLE_LENGTH).toBe(DAY_LENGTH + NIGHT_LENGTH);
  });

  it("roosting birds lay nothing; dawn resumes laying", () => {
    const s = createSim(); // 2 chickens
    s.clock.t = DAY_LENGTH - 0.05;
    step(s, 0.1, constHooks(0.5));
    drainEvents(s);
    step(s, 10, constHooks(0.5)); // deep into the night
    expect(drainEvents(s).filter((e) => e.type === "egg-laid")).toHaveLength(0);
    step(s, NIGHT_LENGTH, constHooks(0.5)); // through dawn
    step(s, 3, constHooks(0.5));
    expect(drainEvents(s).filter((e) => e.type === "egg-laid").length).toBeGreaterThan(0);
  });

  it("first nightfall introduces the foxes (milestone)", () => {
    const s = quiet();
    s.clock.t = DAY_LENGTH;
    step(s, 0.1, constHooks(0.5));
    expect(drainEvents(s).some((e) => e.type === "milestone" && e.id === "night_intro")).toBe(true);
  });
});

describe("foxes", () => {
  it("slink in on the night cadence and creep upward", () => {
    const s = quiet();
    atNight(s);
    step(s, 5, constHooks(0.5)); // spawn timer: 4 + 0.5×4 = 6s
    expect(s.foxes).toHaveLength(0);
    step(s, 1.5, constHooks(0.5));
    expect(s.foxes).toHaveLength(1);
    const y0 = s.foxes[0].y;
    step(s, 1, constHooks(0.5));
    expect(s.foxes[0].y).toBeLessThan(y0);
  });

  it("never appear in daylight", () => {
    const s = quiet();
    step(s, 60, constHooks(0.5));
    expect(s.foxes).toHaveLength(0);
  });

  it("a sweep shoos them for a bounty", () => {
    const s = quiet();
    atNight(s);
    const fox = forgeFox(s, 500);
    sweepCollect(s, 200, 500, 200, 500);
    expect(fox.state).toBe("flee");
    expect(s.feathers).toBe(foxBounty(s)); // 8 × featherPerEgg(chicken) = 8
    const ev = drainEvents(s).find((e) => e.type === "fox-shooed");
    expect(ev && "byGuard" in ev && ev.byGuard).toBe(false);
  });

  it("one that reaches the hay steals the oldest egg and bolts", () => {
    const s = quiet();
    atNight(s);
    const egg = forgeGroundEgg(s, { x: 100, y: s.layout.hayBottom - 10 });
    const fox = forgeFox(s, s.layout.hayBottom + 6);
    step(s, 0.3, constHooks(0.5));
    expect(fox.state).toBe("flee");
    expect(fox.carrying).toBe(true);
    expect(egg.phase).toBe("gone");
    expect(drainEvents(s).some((e) => e.type === "fox-stole")).toBe(true);
  });

  it("dawn scatters every climber, and they despawn off-screen", () => {
    const s = quiet();
    s.clock.t = CYCLE_LENGTH - 0.1;
    const fox = forgeFox(s, 400);
    step(s, 0.2, constHooks(0.5));
    expect(fox.state).toBe("flee");
    step(s, 2, constHooks(0.5));
    expect(s.foxes).toHaveLength(0);
  });
});

describe("bird theft (an empty hay line lets foxes through)", () => {
  it("takes a bird, drops the flock count AND the next bird's price", () => {
    const s = quiet();
    s.counts = [5, 0, 0, 0, 0];
    atNight(s);
    const fox = forgeFox(s, s.layout.hayBottom - 4); // past bare hay
    const costBefore = birdCost(s, 0);
    step(s, 10, constHooks(0.5)); // climbs on to the flock line
    expect(fox.state).toBe("flee");
    expect(fox.bird).toBe(0);
    expect(s.counts[0]).toBe(4);
    expect(birdCost(s, 0)).toBeLessThan(costBefore);
    const evs = drainEvents(s);
    expect(evs.some((e) => e.type === "fox-stole-bird")).toBe(true);
    expect(evs.some((e) => e.type === "milestone" && e.id === "fox_bird_intro")).toBe(true);
  });

  it("an egg on the hay still buys the flock's safety", () => {
    const s = quiet();
    s.counts = [5, 0, 0, 0, 0];
    atNight(s);
    forgeGroundEgg(s, { x: 100, y: s.layout.hayBottom - 10 });
    const fox = forgeFox(s, s.layout.hayBottom + 6);
    step(s, 0.4, constHooks(0.5));
    expect(fox.carrying).toBe(true); // egg, not bird
    expect(s.counts[0]).toBe(5);
  });

  it("never takes a species' last bird", () => {
    const s = quiet();
    s.counts = [1, 0, 0, 0, 0];
    atNight(s);
    const fox = forgeFox(s, s.layout.hayBottom - 4);
    step(s, 10, constHooks(0.5));
    expect(fox.state).toBe("flee");
    expect(fox.bird).toBeUndefined();
    expect(s.counts[0]).toBe(1);
  });

  it("two birds a night, never more", () => {
    const s = quiet();
    s.counts = [9, 0, 0, 0, 0];
    atNight(s);
    const zone = s.layout.hayTop * FOX_BIRD_DEPTH;
    forgeFox(s, zone + 3, 100);
    forgeFox(s, zone + 3, 200);
    forgeFox(s, zone + 3, 300);
    step(s, 0.3, constHooks(0.5));
    expect(s.counts[0]).toBe(9 - FOX_BIRD_CAP);
    expect(s.foxes.every((f) => f.state === "flee")).toBe(true);
  });
});

describe("the Night guard", () => {
  it("auto-shoos the closest fox on its level cadence, bounty included", () => {
    const s = quiet();
    s.n.guard = 1;
    atNight(s);
    const closest = forgeFox(s, s.layout.hayBottom + 60);
    const trailing = forgeFox(s, s.layout.hayBottom + 170, 300);
    step(s, 0.7, constHooks(0.5)); // guard peeks every 0.5s when idle
    expect(closest.state).toBe("flee"); // guard picks the biggest threat
    expect(trailing.state).toBe("climb"); // next shoo waits GUARD_INTERVAL[1]
    expect(s.feathers).toBe(foxBounty(s));
    const ev = drainEvents(s).find((e) => e.type === "fox-shooed");
    expect(ev && "byGuard" in ev && ev.byGuard).toBe(true);
    step(s, 1, constHooks(0.5)); // still inside the cooldown
    expect(trailing.state).toBe("climb");
    expect(GUARD_INTERVAL[1]).toBeGreaterThan(GUARD_INTERVAL[3]); // levels speed it up
  });

  it("does nothing unowned", () => {
    const s = quiet();
    atNight(s);
    const fox = forgeFox(s, s.layout.hayBottom + 140);
    step(s, 2, constHooks(0.5));
    expect(fox.state).toBe("climb");
    expect(s.feathers).toBe(0);
  });
});

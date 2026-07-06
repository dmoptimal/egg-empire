// Day/night + foxes (Lily's design): the clock, the roost pause, fox
// climb/steal/flee, sweep bounties, and the Night guard automation.

import { describe, expect, it } from "vitest";
import {
  DAY_LENGTH,
  FIREFLY_CAP,
  FOX_BIRD_CAP,
  FOX_BIRD_DEPTH,
  FOX_KINDS,
  GUARD_INTERVAL,
  NIGHT_LENGTH,
  ROUT_BOUNTY_PCT,
  SNEAK_DASH,
} from "../config/night";
import { sweepCollect } from "./collect";
import { birdCost } from "./economy";
import { drainEvents } from "./events";
import { CYCLE_LENGTH, foxBounty, guardLineY, guardX, lungeGuard, moonEggValue, petBird } from "./night";
import { createSim } from "./state";
import { constHooks, forgeGroundEgg, step } from "./test-helpers";
import type { Fox, FoxKind, SimEvent, SimState } from "./types";

function quiet() {
  const s = createSim();
  s.counts = [0, 0, 0, 0, 0];
  return s;
}

/** Flip the sim into night and swallow the transition events. */
function atNight(s: SimState): void {
  s.n.sp1 = 1; // the cycle only runs once Ducks are unlocked
  s.clock.t = DAY_LENGTH;
  step(s, 0.05, constHooks(0.5));
  drainEvents(s);
}

function forgeFox(s: SimState, y: number, x = 200, kind: FoxKind = "fox"): Fox {
  const f: Fox = {
    id: s.foxSeq++,
    x,
    y,
    state: "climb",
    kind,
    hp: FOX_KINDS[kind].taps,
    pauseT: 0,
    moveT: SNEAK_DASH,
    carrying: false,
  };
  s.foxes.push(f);
  return f;
}

describe("the clock", () => {
  it("sun sets after DAY_LENGTH and rises NIGHT_LENGTH later", () => {
    const s = quiet();
    s.n.sp1 = 1;
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
    s.n.sp1 = 1;
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
    s.n.sp1 = 1;
    s.clock.t = DAY_LENGTH;
    step(s, 0.1, constHooks(0.5));
    expect(drainEvents(s).some((e) => e.type === "milestone" && e.id === "night_intro")).toBe(true);
  });
});

describe("foxes", () => {
  it("slink in on the night cadence and creep upward", () => {
    const s = quiet();
    atNight(s);
    step(s, 8, constHooks(0.5)); // dusk spawn gap: 7 + 0.5×4 = 9s
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
    s.n.sp1 = 1;
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

describe("the Night guard (a patrol line, not a farm-wide sweep)", () => {
  it("shoos a fox CROSSING the line, then recharges — the next one slips through", () => {
    const s = quiet();
    s.counts = [5, 0, 0, 0, 0];
    s.n.guard = 1;
    atNight(s);
    const first = forgeFox(s, s.layout.hayBottom - 4); // bare hay: both climb on
    const second = forgeFox(s, s.layout.hayBottom + 116, 300);
    step(s, 4, constHooks(0.5));
    expect(first.state).toBe("climb"); // still marching — no early invisible shoo
    step(s, 8, constHooks(0.5));
    expect(first.state).toBe("flee"); // met the watch at the line
    expect(s.feathers).toBe(foxBounty(s));
    const evs = drainEvents(s);
    const shooed = evs.find((e) => e.type === "fox-shooed");
    expect(shooed && "byGuard" in shooed && shooed.byGuard).toBe(true);
    // the second fox crossed while the watch was recharging: it got through
    expect(evs.some((e) => e.type === "fox-stole-bird")).toBe(true);
    expect(second.bird).toBe(0);
    expect(s.counts[0]).toBe(4);
    expect(GUARD_INTERVAL[1]).toBeGreaterThan(GUARD_INTERVAL[3]); // levels recharge faster
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

describe("the tutorial farm", () => {
  it("stays daylit until Ducks are unlocked", () => {
    const s = quiet(); // sp0 only
    step(s, DAY_LENGTH + 30, constHooks(0.5));
    expect(s.clock.night).toBe(false);
    expect(s.foxes).toHaveLength(0);
  });
});

describe("steal-and-flee rescue", () => {
  it("tapping the escape drops the egg back into play — no bounty on top", () => {
    const s = quiet();
    atNight(s);
    forgeGroundEgg(s, { x: 100, y: s.layout.hayBottom - 10 });
    const fox = forgeFox(s, s.layout.hayBottom + 6);
    step(s, 0.3, constHooks(0.5)); // steals the egg and turns to bolt
    expect(fox.carrying).toBe(true);
    expect(fox.loot).toBeDefined();
    drainEvents(s);
    sweepCollect(s, fox.x, fox.y, fox.x, fox.y);
    expect(fox.carrying).toBe(false);
    expect(fox.state).toBe("flee"); // still legs it, just empty-pawed
    expect(s.feathers).toBe(0); // the rescue IS the reward
    expect(drainEvents(s).some((e) => e.type === "fox-dropped")).toBe(true);
    // the same sweep that tapped the fox caught the dropped egg mid-air —
    // it's already flying to a basket. One gesture, egg saved AND banked.
    expect(s.ground.length + s.falling.length + s.flying.length).toBe(1);
  });

  it("a kidnapped hen can be saved mid-escape", () => {
    const s = quiet();
    s.counts = [5, 0, 0, 0, 0];
    atNight(s);
    const zone = s.layout.hayTop * FOX_BIRD_DEPTH;
    const fox = forgeFox(s, zone + 2); // one step from the flock
    step(s, 0.2, constHooks(0.5));
    expect(fox.bird).toBe(0);
    expect(s.counts[0]).toBe(4);
    drainEvents(s);
    sweepCollect(s, fox.x, fox.y, fox.x, fox.y);
    expect(s.counts[0]).toBe(5);
    expect(fox.bird).toBeUndefined();
    expect(s.feathers).toBe(0);
    expect(drainEvents(s).some((e) => e.type === "fox-dropped-bird")).toBe(true);
    expect(s.stats.birdsSaved).toBe(1);
  });
});

describe("the witching hour", () => {
  it("spawn gaps tighten as the night deepens", () => {
    const dusk = quiet();
    atNight(dusk); // progress ≈ 0 → gap ≈ 7 + 0.5×4
    const early = dusk.nextFoxIn;
    const late = quiet();
    late.n.sp1 = 1;
    late.clock.t = DAY_LENGTH + NIGHT_LENGTH * 0.98;
    late.clock.night = true;
    step(late, 0.05, constHooks(0.5)); // progress ≈ 1 → gap ≈ 2.2 + 0.5×1.8
    expect(early).toBeGreaterThan(8);
    expect(late.nextFoxIn).toBeLessThan(4);
  });

  it("dawn routs the stragglers for a token bounty each", () => {
    const s = quiet();
    s.n.sp1 = 1;
    s.clock.t = CYCLE_LENGTH - 0.1;
    forgeFox(s, 400);
    forgeFox(s, 420, 300);
    step(s, 0.2, constHooks(0.5));
    const each = Math.max(1, Math.round(foxBounty(s) * ROUT_BOUNTY_PCT));
    expect(s.feathers).toBe(2 * each);
    expect(drainEvents(s).filter((e) => e.type === "fox-routed")).toHaveLength(2);
  });
});

describe("the rogues' gallery", () => {
  it("a bruiser walks through the patrol line, soaks a tap, and pays 4×", () => {
    const s = quiet();
    s.n.guard = 3;
    atNight(s);
    const line = guardLineY(s);
    const b = forgeFox(s, line + 30, 200, "bruiser");
    step(s, 1.5, constHooks(0.5)); // crosses the line at 34 px/s
    expect(b.y).toBeLessThan(line);
    expect(b.state).toBe("climb"); // the watch can't touch him
    expect(drainEvents(s).some((e) => e.type === "fox-shooed")).toBe(false);
    sweepCollect(s, b.x, b.y, b.x, b.y); // first tap staggers
    expect(b.state).toBe("climb");
    expect(b.pauseT).toBeGreaterThan(0);
    expect(s.feathers).toBe(0);
    expect(drainEvents(s).some((e) => e.type === "fox-staggered")).toBe(true);
    sweepCollect(s, b.x, b.y, b.x, b.y); // second tap sends him off
    expect(b.state).toBe("flee");
    expect(s.feathers).toBe(Math.round(foxBounty(s) * FOX_KINDS.bruiser.bounty));
  });

  it("kits arrive as a pack of three and turn back at the flock line", () => {
    const s = quiet();
    s.counts = [5, 0, 0, 0, 0];
    s.stats.nights = 5; // the gallery is open
    atNight(s);
    s.nextFoxIn = 0.01;
    step(s, 0.05, constHooks(0.85)); // roll 85 ∈ (80, 92] → kit
    expect(s.foxes).toHaveLength(3);
    expect(s.foxes.every((f) => f.kind === "kit")).toBe(true);
    const kit = forgeFox(s, s.layout.hayTop * FOX_BIRD_DEPTH + 2, 100, "kit");
    step(s, 0.1, constHooks(0.5));
    expect(kit.state).toBe("flee"); // turned back …
    expect(kit.bird).toBeUndefined(); // … without a hen
    expect(s.counts[0]).toBe(5);
  });

  it("a sneak dashes, then freezes flat in the grass", () => {
    const s = quiet();
    atNight(s);
    const sn = forgeFox(s, 500, 200, "sneak");
    step(s, 1.05, constHooks(0.5)); // dash spends itself
    expect(sn.pauseT).toBeGreaterThan(0);
    const frozen = sn.y;
    step(s, 0.3, constHooks(0.5));
    expect(sn.y).toBe(frozen); // hiding — not an inch
    step(s, 0.6, constHooks(0.5));
    expect(sn.y).toBeLessThan(frozen); // dashing again
  });

  it("the first nights are plain foxes only", () => {
    const s = quiet();
    atNight(s); // stats.nights = 0
    s.nextFoxIn = 0.01;
    step(s, 0.05, constHooks(0.99)); // a roll that would be a bruiser
    expect(s.foxes).toHaveLength(1);
    expect(s.foxes[0].kind).toBe("fox");
  });
});

describe("moon eggs", () => {
  it("drop from the roost on a night cadence and break on the hay", () => {
    const s = createSim(); // needs a flock to shuffle one loose
    s.n.sp1 = 1;
    s.clock.t = DAY_LENGTH;
    step(s, 0.05, constHooks(0.5));
    drainEvents(s);
    step(s, 11.5, constHooks(0.5)); // gap: 9 + 0.5×6 = 12s
    expect(s.moonEggs).toHaveLength(0);
    step(s, 1, constHooks(0.5));
    expect(s.moonEggs).toHaveLength(1);
    step(s, 6, constHooks(0.5)); // 275px of fall at 60px/s
    expect(s.moonEggs.some((m) => m.y >= s.layout.hayTop)).toBe(false);
    expect(drainEvents(s).some((e) => e.type === "moon-egg-broke")).toBe(true);
  });

  it("a sweep banks one for a slice of the flock's day rate", () => {
    const s = createSim();
    s.counts = [10, 0, 0, 0, 0];
    atNight(s);
    s.moonEggs.push({ id: 1, x: 150, y: 200 });
    const value = moonEggValue(s);
    sweepCollect(s, 150, 200, 150, 200);
    expect(s.moonEggs).toHaveLength(0);
    expect(s.money).toBe(value);
    expect(s.stats.moonEggs).toBe(1);
    const evs = drainEvents(s);
    expect(evs.some((e) => e.type === "moon-egg-caught" && e.money === value)).toBe(true);
    expect(evs.some((e) => e.type === "milestone" && e.id === "moon_intro")).toBe(true);
  });

  it("value scales with the flock", () => {
    const small = createSim();
    small.counts = [2, 0, 0, 0, 0];
    const big = createSim();
    big.counts = [50, 0, 0, 0, 0];
    expect(moonEggValue(big)).toBeGreaterThan(moonEggValue(small));
  });
});

describe("fireflies", () => {
  it("drift at night, capped, and wink out after daybreak", () => {
    const s = quiet();
    atNight(s);
    step(s, 60, constHooks(0.5));
    expect(s.fireflies.length).toBeGreaterThan(0);
    expect(s.fireflies.length).toBeLessThanOrEqual(FIREFLY_CAP);
    s.clock.t = 0; // force daylight
    s.clock.night = false;
    step(s, 5, constHooks(0.5)); // daylight burns lifetimes 4× faster
    expect(s.fireflies.length).toBeLessThanOrEqual(1);
  });

  it("one sweep chains them — each extra catch pays a step more", () => {
    const s = quiet();
    s.counts = [1, 0, 0, 0, 0];
    atNight(s);
    for (let i = 0; i < 3; i++)
      s.fireflies.push({ id: 100 + i, x: 200 + i * 8, y: 200, vx: 0, vy: 0, life: 9 });
    sweepCollect(s, 208, 200, 208, 200);
    expect(s.fireflies).toHaveLength(0);
    expect(s.feathers).toBe(1 + 2 + 3); // featherPerEgg(chicken)=1, chain steps
    const chains = drainEvents(s)
      .filter((e): e is Extract<SimEvent, { type: "firefly-caught" }> => e.type === "firefly-caught")
      .map((e) => e.chain);
    expect(Math.max(...chains)).toBe(3);
    expect(s.stats.fireflies).toBe(3);
  });
});

describe("goodnight taps", () => {
  it("nightfall stocks the pats; spending them all earns a rested day", () => {
    const s = createSim();
    s.counts = [5, 0, 0, 0, 0];
    atNight(s);
    expect(s.petsLeft).toBe(5); // min(5 birds, cap 8)
    for (let i = 0; i < 5; i++) expect(petBird(s, 100 + i, 70)).toBe(true);
    expect(petBird(s, 100, 70)).toBe(false); // pats are spent
    expect(s.feathers).toBe(10); // 2 feathers a pat at chicken rates
    expect(s.stats.pets).toBe(5);
    drainEvents(s);
    step(s, NIGHT_LENGTH, constHooks(0.5)); // through dawn
    expect(s.restedDay).toBe(true);
    expect(drainEvents(s).some((e) => e.type === "flock-rested")).toBe(true);
    step(s, DAY_LENGTH + 0.5, constHooks(0.5)); // through the day to next dusk
    expect(s.clock.night).toBe(true);
    expect(s.restedDay).toBe(false); // the buff was for the day it earned
  });

  it("no pats by day, none below the roost band, none past the stock", () => {
    const s = createSim();
    expect(petBird(s, 100, 70)).toBe(false); // daylight
    atNight(s);
    expect(petBird(s, 100, 300)).toBe(false); // too low — that's a sweep
    expect(s.petsLeft).toBe(2); // two starter chickens
  });
});

describe("tap-to-lunge", () => {
  it("a tap on a charged watchman clears his patch and spends the charge", () => {
    const s = quiet();
    s.n.guard = 1;
    atNight(s);
    const gx = guardX(s, 0, 1);
    const lineY = guardLineY(s) + 20;
    const near = forgeFox(s, lineY + 40, gx - 50);
    const far = forgeFox(s, lineY + 40, gx + 300); // outside the lunge
    const runner = forgeFox(s, lineY - 20, gx + 40);
    runner.state = "flee";
    runner.carrying = true;
    runner.loot = { species: 0, golden: false };
    drainEvents(s);
    expect(lungeGuard(s, gx + 10, lineY)).toBe(true);
    expect(near.state).toBe("flee");
    expect(far.state).toBe("climb");
    expect(runner.carrying).toBe(false); // loot intercepted mid-escape
    expect(s.guardT).toBe(GUARD_INTERVAL[1]);
    const evs = drainEvents(s);
    const lunge = evs.find((e) => e.type === "guard-lunge");
    expect(lunge && "count" in lunge && lunge.count).toBe(2);
  });

  it("never whiffs, never fires mid-recharge, never touches a bruiser", () => {
    const s = quiet();
    s.n.guard = 1;
    atNight(s);
    const gx = guardX(s, 0, 1);
    const lineY = guardLineY(s) + 20;
    expect(lungeGuard(s, gx, lineY)).toBe(false); // nothing to hit
    expect(s.guardT).toBeLessThanOrEqual(0); // charge kept
    forgeFox(s, lineY + 30, gx + 20, "bruiser");
    expect(lungeGuard(s, gx, lineY)).toBe(false); // bruisers shrug him off
    forgeFox(s, lineY + 30, gx - 30);
    s.guardT = 5;
    expect(lungeGuard(s, gx, lineY)).toBe(false); // still recharging
  });
});

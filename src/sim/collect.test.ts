// Player collection: taps and segment sweeps, flight into the nearest basket
// with space, mid-air catches, and the baskets-full warning.

import { describe, expect, it } from "vitest";
import { addBasket } from "./baskets";
import { sweepCollect } from "./collect";
import { drainEvents } from "./events";
import { createSim } from "./state";
import { constHooks, forgeFallingEgg, forgeGroundEgg, step } from "./test-helpers";

function quietSim() {
  const s = createSim(); // 390×700: hayTop 350, basketY 585, basket0.x 338
  s.counts = [0, 0, 0, 0, 0]; // no background laying
  return s;
}

describe("sweep collection", () => {
  it("a tap on an egg sends it flying, then deposits after the flight", () => {
    const s = quietSim();
    const egg = forgeGroundEgg(s, { x: 100, y: 400 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(egg.phase).toBe("flying");
    expect(egg.claimed).toBe(true);
    expect(egg.basket).toBe(s.baskets[0]);
    expect(egg.tx).toBe(338);
    expect(egg.ty).toBe(561); // basketY - 24
    expect(drainEvents(s).filter((e) => e.type === "egg-collected")).toHaveLength(1);
    expect(s.baskets[0].count).toBe(0); // not yet deposited

    step(s, 0.5, constHooks(0.5)); // flight takes 0.45s
    expect(s.baskets[0].count).toBe(1);
    expect(s.baskets[0].value).toBe(10);
    expect(s.baskets[0].feathers).toBe(1);
    expect(s.flying).toHaveLength(0);
    expect(drainEvents(s).filter((e) => e.type === "egg-deposited")).toHaveLength(1);
  });

  it("collects along the whole swept segment", () => {
    const s = quietSim();
    forgeGroundEgg(s, { x: 150, y: 400 });
    forgeGroundEgg(s, { x: 200, y: 400 });
    forgeGroundEgg(s, { x: 250, y: 400 });
    sweepCollect(s, 100, 400, 300, 400);
    expect(s.flying).toHaveLength(3);
  });

  it("respects the 46px sweep radius", () => {
    const s = quietSim();
    const near = forgeGroundEgg(s, { x: 100, y: 445 });
    const far = forgeGroundEgg(s, { x: 100, y: 447 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(near.phase).toBe("flying");
    expect(far.phase).toBe("ground");
  });

  it("catches falling eggs mid-air only once they are over the hay", () => {
    const s = quietSim();
    const above = forgeFallingEgg(s, { x: 100, y: 300, targetY: 500 });
    const below = forgeFallingEgg(s, { x: 200, y: 360, targetY: 500 });
    sweepCollect(s, 100, 300, 200, 360);
    expect(above.phase).toBe("falling"); // y < hayTop: not catchable
    expect(below.phase).toBe("flying");
  });

  it("skips claimed eggs", () => {
    const s = quietSim();
    const egg = forgeGroundEgg(s, { x: 100, y: 400, claimed: true });
    sweepCollect(s, 100, 400, 100, 400);
    expect(egg.phase).toBe("ground");
  });

  it("routes to the nearest basket that still has space", () => {
    const s = quietSim();
    addBasket(s); // baskets now at x=338 and x=272
    s.baskets[0].count = 12; // cap with no bsize levels
    const egg = forgeGroundEgg(s, { x: 330, y: 400 });
    sweepCollect(s, 330, 400, 330, 400);
    expect(egg.basket).toBe(s.baskets[1]);
    expect(egg.tx).toBe(272);
  });

  it("warns once per cooldown while a full basket's truck is idle", () => {
    const s = quietSim();
    s.baskets[0].count = 12;
    const egg = forgeGroundEgg(s, { x: 100, y: 400 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(egg.phase).toBe("ground");
    expect(egg.claimed).toBe(false);
    expect(drainEvents(s).filter((e) => e.type === "baskets-full")).toHaveLength(1);

    sweepCollect(s, 100, 400, 100, 400); // still cooling down
    expect(drainEvents(s).filter((e) => e.type === "baskets-full")).toHaveLength(0);

    s.fullWarnCd = 0; // cooldown over, truck still idle → warns again
    sweepCollect(s, 100, 400, 100, 400);
    expect(drainEvents(s).filter((e) => e.type === "baskets-full")).toHaveLength(1);
  });

  it("soft cap: a dispatched truck's basket keeps accepting up to 2× cap", () => {
    const s = quietSim();
    s.baskets[0].count = 12;
    s.baskets[0].value = 120;
    step(s, 0.1, constHooks(0.5)); // full basket → truck dispatches ("in")
    expect(s.baskets[0].truckState).toBe("in");

    const egg = forgeGroundEgg(s, { x: 100, y: 400, value: 10 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(egg.phase).toBe("flying"); // no bounce — the truck is coming anyway
    expect(drainEvents(s).filter((e) => e.type === "baskets-full")).toHaveLength(0);

    s.baskets[0].count = 24; // at double cap the wall is back
    const overflow = forgeGroundEgg(s, { x: 100, y: 400 });
    sweepCollect(s, 100, 400, 100, 400);
    expect(overflow.phase).toBe("ground");
    expect(drainEvents(s).filter((e) => e.type === "baskets-full")).toHaveLength(1);
  });
});

// Collectors (farmhands): idle → seek nearest ground egg → bag it (chaining
// while the bag has room) → carry to the nearest basket with space → deposit.
// Ported 1:1 from the prototype's collectorUpdate.

import {
  COLL_DEPOSIT_DIST,
  COLL_DEPOSIT_OFFSET_X,
  COLL_PICKUP_DIST,
  COLL_SPAWN_OFFSET_X,
} from "../config/constants";
import { basketWithSpace } from "./baskets";
import {
  basketCap,
  collBagCap,
  collSpeed,
  collValueMult,
  featherGolden,
  featherPerEgg,
} from "./economy";
import { releaseEgg } from "./eggs";
import { emit } from "./events";
import type { Collector, Egg, SimState } from "./types";

export function addCollector(state: SimState): Collector {
  const c: Collector = {
    x: state.baskets[0].x - COLL_SPAWN_OFFSET_X,
    y: state.layout.hayBottom,
    facing: 1,
    mode: "idle",
    target: null,
    bag: [],
    dest: null,
  };
  state.collectors.push(c);
  return c;
}

function nearestFreeEgg(state: SimState, x: number, y: number): Egg | null {
  let best: Egg | null = null;
  let bd = Infinity;
  for (const e of state.ground) {
    if (e.claimed) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

export function updateCollector(state: SimState, c: Collector, dt: number): void {
  const speed = collSpeed(state);
  if (c.mode === "idle") {
    const best = nearestFreeEgg(state, c.x, c.y);
    if (best) {
      best.claimed = true;
      c.target = best;
      c.mode = "seek";
    } else if (c.bag.length > 0) {
      c.mode = "carry";
    }
    return;
  }
  if (c.mode === "seek") {
    const t = c.target;
    // Target can vanish under us (spoiled or despawned at the cap).
    if (!t || t.phase === "gone") {
      c.target = null;
      c.mode = c.bag.length > 0 ? "carry" : "idle";
      return;
    }
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < COLL_PICKUP_DIST) {
      // Gentle Hands applies at pickup; feathers are counted at deposit.
      c.bag.push({ value: Math.round(t.value * collValueMult(state)), golden: t.golden, species: t.species });
      releaseEgg(state, t);
      emit(state, { type: "egg-picked-up", egg: t });
      c.target = null;
      if (c.bag.length < collBagCap(state)) {
        const best = nearestFreeEgg(state, c.x, c.y);
        if (best) {
          best.claimed = true;
          c.target = best;
          return;
        }
      }
      c.mode = "carry";
    } else {
      c.x += (dx / d) * speed * dt;
      c.y += (dy / d) * speed * dt;
      c.facing = dx < 0 ? -1 : 1;
    }
    return;
  }
  if (c.mode === "carry") {
    if (!c.dest || c.dest.count >= basketCap(state)) c.dest = basketWithSpace(state, c.x);
    if (!c.dest) return; // every basket full: stand and wait, bag in hand
    const dx = c.dest.x - COLL_DEPOSIT_OFFSET_X - c.x;
    const dy = state.layout.hayBottom - c.y;
    const d = Math.hypot(dx, dy);
    if (d < COLL_DEPOSIT_DIST) {
      for (const eg of c.bag) {
        c.dest.count++;
        c.dest.value += eg.value;
        c.dest.feathers += eg.golden ? featherGolden(state) : featherPerEgg(state);
      }
      c.bag.length = 0;
      c.dest = null;
      c.mode = "idle";
    } else {
      c.x += (dx / d) * speed * dt;
      c.y += (dy / d) * speed * dt;
      c.facing = dx < 0 ? -1 : 1;
    }
  }
}

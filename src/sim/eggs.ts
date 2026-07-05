// Egg lifecycle: lay → fall (one bounce) → ground (spoils at EGG_LIFE) →
// [swept] fly → deposit into a basket. The sim owns the lists and positions;
// render maps sprites onto them (CLAUDE.md two-system rule).

import {
  BIRD_MIN_X,
  BIRD_MIN_Y,
  BIRD_SPAWN_BAND,
  BIRD_SPAWN_BAND_MIN,
  EGG_BOUNCE_MIN_VY,
  EGG_BOUNCE_RESTITUTION,
  EGG_FLY_TIME,
  EGG_GRAVITY,
  EGG_INITIAL_VY,
  EGG_POOL_EXTRA,
  EGG_SPAWN_JITTER_X,
  EGG_SPAWN_Y_OFFSET,
  EGG_TARGET_BAND_INSET,
  EGG_TARGET_TOP_INSET,
  GOLDEN_VALUE_MULT,
} from "../config/constants";
import {
  OSTRICH_ROLL_DRAG,
  OSTRICH_ROLL_MIN,
  OSTRICH_ROLL_VAR,
  SPECIES,
} from "../config/species";
import { eggCap, eggLife, featherGolden, featherPerEgg, goldenPct, worthMult } from "./economy";
import { RUSH_EGG_LIFE } from "../config/economy";
import { emit } from "./events";
import { bump } from "./stats";
import type { Basket, Egg, SimHooks, SimState, SpawnPoint } from "./types";

/** Remove an egg from every list and mark it gone (pool release equivalent). */
export function releaseEgg(state: SimState, e: Egg): void {
  e.phase = "gone";
  e.claimed = false;
  for (const arr of [state.ground, state.falling, state.flying]) {
    const k = arr.indexOf(e);
    if (k >= 0) arr.splice(k, 1);
  }
}

/**
 * Oldest ground egg (or oldest falling egg) silently vanishes at the cap.
 * Shimmer eggs are exempt — a rush trigger must never be churned away.
 */
function despawnOldest(state: SimState): void {
  const e = state.ground.find((x) => !x.rush) ?? state.falling.find((x) => !x.rush);
  if (!e) return;
  releaseEgg(state, e);
  emit(state, { type: "egg-despawned", egg: e });
}

/** Headless spawn fallback: same band the prototype scatters bird views over. */
function defaultSpawnPoint(state: SimState, hooks: SimHooks): SpawnPoint {
  const { w, hayTop } = state.layout;
  return {
    x: BIRD_MIN_X + hooks.rng() * (w - BIRD_MIN_X * 2),
    y: BIRD_MIN_Y + hooks.rng() * Math.max(hayTop - BIRD_SPAWN_BAND, BIRD_SPAWN_BAND_MIN),
  };
}

export function layEgg(
  state: SimState,
  species: number,
  hooks: SimHooks,
  /** Burst-mate anchor (quail clusters): spawn beside it, land beside it. */
  near?: Pick<Egg, "x" | "y" | "targetY">,
): Egg | null {
  // No bird to drop from → nothing happens, not even the cap eviction
  // (prototype: layEgg early-returns on an empty view list).
  const p = near ?? (hooks.spawnPoint ? hooks.spawnPoint(species) : defaultSpawnPoint(state, hooks));
  if (!p) return null;
  // Ground cap (Roomier hay raises it): oldest spoils first, silently.
  if (state.ground.length + state.falling.length >= eggCap(state)) despawnOldest(state);
  // Pool bound (cap + 40): a huge in-flight backlog skips the lay entirely.
  if (state.ground.length + state.falling.length + state.flying.length >= eggCap(state) + EGG_POOL_EXTRA)
    return null;
  const golden = hooks.rng() < goldenPct(state, species);
  const { hayTop, hayBottom } = state.layout;
  const tyMin = hayTop + EGG_TARGET_TOP_INSET;
  const tyBand = hayBottom - hayTop - EGG_TARGET_BAND_INSET;
  const e: Egg = {
    id: state.nextEggId++,
    species,
    golden,
    // Round the upgraded value first, then apply the golden ×10 — prototype order.
    value: Math.round(SPECIES[species].eggValue * worthMult(state, species)) * (golden ? GOLDEN_VALUE_MULT : 1),
    x: p.x + (hooks.rng() * EGG_SPAWN_JITTER_X * 2 - EGG_SPAWN_JITTER_X),
    y: p.y - EGG_SPAWN_Y_OFFSET,
    vy: EGG_INITIAL_VY,
    targetY: near
      ? Math.max(tyMin, Math.min(tyMin + tyBand, near.targetY + hooks.rng() * 24 - 12))
      : tyMin + hooks.rng() * tyBand,
    age: 0,
    claimed: false,
    bounced: false,
    phase: "falling",
    flyT: 0,
    sx: 0,
    sy: 0,
    tx: 0,
    ty: 0,
    basket: null,
  };
  // Ostrich eggs are too big to sit still — they land rolling (see
  // updateGround); sweeping one mid-roll smashes its neighbourhood along.
  if (species === 4)
    e.vx = (hooks.rng() < 0.5 ? -1 : 1) * (OSTRICH_ROLL_MIN + hooks.rng() * OSTRICH_ROLL_VAR);
  state.falling.push(e);
  emit(state, { type: "egg-laid", egg: e });
  return e;
}

/** Drop the shimmer egg that starts a Golden Rush when swept. */
export function layRushEgg(state: SimState, hooks: SimHooks): void {
  const p = hooks.spawnPoint ? hooks.spawnPoint(0) : defaultSpawnPoint(state, hooks);
  if (!p) return;
  const { hayTop, hayBottom } = state.layout;
  const e: Egg = {
    id: state.nextEggId++,
    species: 0,
    golden: true, // golden visuals; render layers a shimmer on top
    rush: true,
    value: 0,
    x: p.x + (hooks.rng() * EGG_SPAWN_JITTER_X * 2 - EGG_SPAWN_JITTER_X),
    y: p.y - EGG_SPAWN_Y_OFFSET,
    vy: EGG_INITIAL_VY,
    targetY:
      hayTop + EGG_TARGET_TOP_INSET + hooks.rng() * (hayBottom - hayTop - EGG_TARGET_BAND_INSET),
    age: 0,
    claimed: false,
    bounced: false,
    phase: "falling",
    flyT: 0,
    sx: 0,
    sy: 0,
    tx: 0,
    ty: 0,
    basket: null,
  };
  state.falling.push(e);
  emit(state, { type: "egg-laid", egg: e });
}

/** Player swept this egg: claim it and launch it toward the basket. */
export function collectEgg(state: SimState, e: Egg, basket: Basket): void {
  e.claimed = true;
  e.basket = basket;
  const k = state.ground.indexOf(e);
  if (k >= 0) state.ground.splice(k, 1);
  const k2 = state.falling.indexOf(e);
  if (k2 >= 0) state.falling.splice(k2, 1);
  e.flyT = 0;
  e.sx = e.x;
  e.sy = e.y;
  e.tx = basket.x;
  e.ty = state.layout.basketY - 24;
  e.phase = "flying";
  state.flying.push(e);
  emit(state, { type: "egg-collected", egg: e });
}

function depositEgg(state: SimState, e: Egg): void {
  const b = e.basket;
  if (!b) return;
  b.count++;
  b.value += e.value;
  b.feathers += e.golden ? featherGolden(state, e.species) : featherPerEgg(state, e.species);
  b.load.push({ value: e.value, golden: e.golden, species: e.species });
  bump(state, "eggs");
  if (e.golden) bump(state, "golden");
  releaseEgg(state, e);
  emit(state, { type: "egg-deposited", egg: e, basket: b });
}

export function updateFalling(state: SimState, dt: number): void {
  for (let k = state.falling.length - 1; k >= 0; k--) {
    const e = state.falling[k];
    e.vy += EGG_GRAVITY * dt;
    e.y += e.vy * dt;
    if (e.y >= e.targetY) {
      if (!e.bounced && e.vy > EGG_BOUNCE_MIN_VY) {
        e.bounced = true;
        e.vy *= EGG_BOUNCE_RESTITUTION; // -0.2: flip and damp, prototype's `vy*=-0.2`
        e.y = e.targetY;
        emit(state, { type: "egg-bounced", egg: e });
      } else {
        e.y = e.targetY;
        state.falling.splice(k, 1);
        e.phase = "ground";
        state.ground.push(e);
      }
    }
  }
}

export function updateGround(state: SimState, dt: number): void {
  for (let k = state.ground.length - 1; k >= 0; k--) {
    const e = state.ground[k];
    e.age += dt;
    if (e.vx) {
      // Rolling ostrich egg: coast, rebound off the field edges, coast out.
      e.x += e.vx * dt;
      const drag = 1 - OSTRICH_ROLL_DRAG * dt;
      e.vx *= drag > 0 ? drag : 0;
      if (e.x < 14) {
        e.x = 14;
        e.vx = -e.vx;
      } else if (e.x > state.layout.w - 14) {
        e.x = state.layout.w - 14;
        e.vx = -e.vx;
      }
      if (Math.abs(e.vx) < 8) e.vx = 0;
    }
    if (e.age > (e.rush ? RUSH_EGG_LIFE : eggLife(state))) {
      releaseEgg(state, e);
      emit(state, { type: "egg-spoiled", egg: e });
    }
  }
}

export function updateFlying(state: SimState, dt: number): void {
  for (let k = state.flying.length - 1; k >= 0; k--) {
    const e = state.flying[k];
    e.flyT += dt / EGG_FLY_TIME;
    if (e.flyT >= 1) {
      state.flying.splice(k, 1);
      depositEgg(state, e);
    }
  }
}

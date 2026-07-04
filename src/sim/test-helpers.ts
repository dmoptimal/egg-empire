// Deterministic helpers for the headless sim tests. Not part of the game —
// never imported outside *.test.ts files.

import { tick, type HeldPointer } from "./tick";
import type { Egg, SimHooks, SimState } from "./types";

/** Hooks whose rng always returns `v` (spawn defaults to the bird band). */
export function constHooks(v = 0.5, spawnPoint?: SimHooks["spawnPoint"]): SimHooks {
  const hooks: SimHooks = { rng: () => v };
  if (spawnPoint) hooks.spawnPoint = spawnPoint;
  return hooks;
}

/** Hooks whose rng returns `values` in order, then repeats the last one. */
export function seqHooks(values: number[], spawnPoint?: SimHooks["spawnPoint"]): SimHooks {
  let i = 0;
  const hooks: SimHooks = {
    rng: () => values[Math.min(i++, values.length - 1)],
  };
  if (spawnPoint) hooks.spawnPoint = spawnPoint;
  return hooks;
}

/** Advance the sim by `seconds` in fixed `dt` steps (default 60Hz). */
export function step(
  state: SimState,
  seconds: number,
  hooks?: SimHooks,
  dt = 1 / 60,
  held?: readonly HeldPointer[],
): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) tick(state, dt, hooks, held);
}

let forgeId = 100000; // clear of sim-assigned ids

/** Drop a fully-formed egg straight onto the ground list. */
export function forgeGroundEgg(
  state: SimState,
  fields: Partial<Egg> & { x: number; y: number },
): Egg {
  const e: Egg = {
    id: forgeId++,
    species: 0,
    golden: false,
    value: 10,
    vy: 0,
    targetY: fields.y,
    age: 0,
    claimed: false,
    bounced: true,
    phase: "ground",
    flyT: 0,
    sx: 0,
    sy: 0,
    tx: 0,
    ty: 0,
    basket: null,
    ...fields,
  };
  state.ground.push(e);
  return e;
}

/** Drop a fully-formed egg onto the falling list. */
export function forgeFallingEgg(
  state: SimState,
  fields: Partial<Egg> & { x: number; y: number; targetY: number },
): Egg {
  const e: Egg = {
    id: forgeId++,
    species: 0,
    golden: false,
    value: 10,
    vy: 30,
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
    ...fields,
  };
  state.falling.push(e);
  return e;
}

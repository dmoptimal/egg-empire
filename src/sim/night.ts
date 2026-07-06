// Day/night + foxes (Lily's design). Headless like everything in src/sim:
// the clock gates laying (tick.ts), foxes are plain entities the render
// maps sprites onto, and shooing runs through the same sweep segments as
// egg collection. See src/config/night.ts for every number.

import {
  DAY_LENGTH,
  FOX_BIRD_CAP,
  FOX_BIRD_DEPTH,
  FOX_BOUNTY_MULT,
  FOX_CLIMB_SPEED,
  FOX_FLEE_SPEED,
  FOX_SPAWN_MIN,
  FOX_SPAWN_VAR,
  FOX_TAP_R,
  GUARD_INTERVAL,
  GUARD_LINE_RATIO,
  NIGHT_LENGTH,
} from "../config/night";
import { SPECIES } from "../config/species";
import { segDist2 } from "./collect";
import { featherPerEgg, lvl, unlocked } from "./economy";
import { releaseEgg } from "./eggs";
import { emit } from "./events";
import { fireMilestone } from "./milestones";
import { bump } from "./stats";
import type { Fox, SimState } from "./types";

export const CYCLE_LENGTH = DAY_LENGTH + NIGHT_LENGTH;

/** Advance the sun. Emits nightfall/daybreak; dawn scatters the foxes. */
export function updateClock(state: SimState, dt: number): void {
  const c = state.clock;
  c.t += dt;
  if (c.t >= CYCLE_LENGTH) c.t -= CYCLE_LENGTH;
  // Endless day until Ducks are unlocked — the tutorial farm never freezes.
  if (c.t >= DAY_LENGTH && lvl(state, "sp1") < 1) c.t -= DAY_LENGTH;
  const night = c.t >= DAY_LENGTH;
  if (night !== c.night) {
    c.night = night;
    emit(state, { type: night ? "nightfall" : "daybreak" });
    if (night) {
      state.nightBirdThefts = 0;
    } else {
      bump(state, "nights");
      for (const f of state.foxes) f.state = "flee";
    }
  }
}

/**
 * Which bird a break-through fox grabs: weighted by flock size, and never
 * a species' last bird (income can shrink, never die). -1 = nothing to take.
 */
function pickBird(state: SimState, rng: () => number): number {
  let total = 0;
  for (let i = 0; i < SPECIES.length; i++) if (state.counts[i] > 1) total += state.counts[i];
  if (total === 0) return -1;
  let pick = Math.floor(rng() * total);
  for (let i = 0; i < SPECIES.length; i++) {
    if (state.counts[i] <= 1) continue;
    if (pick < state.counts[i]) return i;
    pick -= state.counts[i];
  }
  return -1;
}

function bestSpecies(state: SimState): number {
  for (let i = SPECIES.length - 1; i >= 0; i--)
    if (unlocked(state, i) && state.counts[i] > 0) return i;
  return 0;
}

/** Feathers a shooed fox drops — scales with your best flock's feather rate. */
export function foxBounty(state: SimState): number {
  return Math.max(1, Math.round(FOX_BOUNTY_MULT * featherPerEgg(state, bestSpecies(state))));
}

function shooFox(state: SimState, fox: Fox, byGuard: boolean): void {
  if (fox.state !== "climb") return;
  fox.state = "flee";
  const feathers = foxBounty(state);
  state.feathers += feathers;
  bump(state, "foxes");
  emit(state, { type: "fox-shooed", fox, feathers, byGuard });
}

/** Sweeps shoo foxes too — called from sweepCollect before the egg pass. */
export function shooFoxesAlong(
  state: SimState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const r2 = FOX_TAP_R * FOX_TAP_R;
  for (let i = state.foxes.length - 1; i >= 0; i--) {
    const f = state.foxes[i];
    if (f.state === "climb" && segDist2(f.x, f.y, x1, y1, x2, y2) <= r2) shooFox(state, f, false);
  }
}

/** Where the Night guards stand watch — just below the roost. */
export const guardLineY = (state: SimState): number =>
  state.layout.hayTop * GUARD_LINE_RATIO;

export function updateFoxes(state: SimState, dt: number, rng: () => number): void {
  const { h, w, hayBottom } = state.layout;
  if (state.guardT > 0) state.guardT -= dt; // the watch recharges
  if (state.clock.night) {
    // new foxes slink in from below the road
    if (state.nextFoxIn <= 0) state.nextFoxIn = FOX_SPAWN_MIN + rng() * FOX_SPAWN_VAR;
    state.nextFoxIn -= dt;
    if (state.nextFoxIn <= 0) {
      state.nextFoxIn = FOX_SPAWN_MIN + rng() * FOX_SPAWN_VAR;
      state.foxes.push({
        id: state.foxSeq++,
        x: 30 + rng() * Math.max(w - 60, 60),
        y: h + 24,
        state: "climb",
        carrying: false,
      });
    }
  }
  const g = lvl(state, "guard");
  for (let i = state.foxes.length - 1; i >= 0; i--) {
    const f = state.foxes[i];
    if (f.state === "climb") {
      f.y -= FOX_CLIMB_SPEED * dt;
      // The patrol line: a READY guard shoos the fox that crosses it, then
      // recharges — a second fox close behind gets through to the flock.
      if (g >= 1 && state.guardT <= 0 && f.y <= guardLineY(state)) {
        shooFox(state, f, true);
        state.guardT = GUARD_INTERVAL[Math.min(g, GUARD_INTERVAL.length - 1)];
        continue;
      }
      if (f.y <= hayBottom) {
        // made it to the hay: grab the oldest unclaimed egg and bolt …
        const egg = state.ground.find((e) => !e.rush && !e.claimed);
        if (egg) {
          releaseEgg(state, egg);
          f.carrying = true;
          f.state = "flee";
          emit(state, { type: "fox-stole", fox: f, egg });
        } else if (f.y <= state.layout.hayTop * FOX_BIRD_DEPTH) {
          // … but an EMPTY hay line lets it through to the flock itself.
          // Capped per night and never a species' last bird — irritating,
          // not game ending (bird prices drop with the count, too).
          if (state.nightBirdThefts < FOX_BIRD_CAP) {
            const species = pickBird(state, rng);
            if (species >= 0) {
              state.counts[species]--;
              state.nightBirdThefts++;
              bump(state, "birdsLost");
              f.bird = species;
              emit(state, { type: "fox-stole-bird", fox: f, species });
              fireMilestone(state, "fox_bird_intro");
            }
          }
          f.state = "flee";
        }
      }
    } else {
      f.y += FOX_FLEE_SPEED * dt;
      if (f.y > h + 40) state.foxes.splice(i, 1);
    }
  }
}

// Day/night + foxes (Lily's design; Night 2.0 pass picked by Dan 2026-07-06).
// Headless like everything in src/sim: the clock gates laying (tick.ts),
// foxes are plain entities the render maps sprites onto, and shooing runs
// through the same sweep segments as egg collection. See src/config/night.ts
// for every number.
//
// Night 2.0: spawns ramp to a witching-hour flurry and dawn routs the
// stragglers; a fox that grabs loot can be tapped mid-escape to drop it;
// tapping a charged guard lunges him at everything nearby; and the rogues'
// gallery (sneak/kit/bruiser) joins after the first two nights.

import {
  DAY_LENGTH,
  FOX_BIRD_CAP,
  FOX_BIRD_DEPTH,
  FOX_BOUNTY_MULT,
  FOX_FLEE_SPEED,
  FOX_KINDS,
  FOX_SPAWN_EARLY_MIN,
  FOX_SPAWN_EARLY_VAR,
  FOX_SPAWN_LATE_MIN,
  FOX_SPAWN_LATE_VAR,
  FOX_TAP_R,
  GUARD_INTERVAL,
  GUARD_LINE_RATIO,
  GUARD_LUNGE_R,
  GUARD_TAP_R,
  KIT_PACK,
  KIT_SPREAD,
  NIGHT_LENGTH,
  ROGUE_NIGHTS,
  ROUT_BOUNTY_PCT,
  SNEAK_DASH,
  SNEAK_HIDE,
  STAGGER_TIME,
  WITCHING_CURVE,
} from "../config/night";
import { SPECIES } from "../config/species";
import { segDist2 } from "./collect";
import { featherPerEgg, lvl, unlocked } from "./economy";
import { releaseEgg, rescueEgg } from "./eggs";
import { emit } from "./events";
import { fireMilestone } from "./milestones";
import { bump } from "./stats";
import type { Fox, FoxKind, SimState } from "./types";

export const CYCLE_LENGTH = DAY_LENGTH + NIGHT_LENGTH;

/** Advance the sun. Emits nightfall/daybreak; dawn routs remaining foxes. */
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
      // Dawn rout: every fox still prowling scatters, worth a token bounty.
      for (const f of state.foxes) {
        if (f.state === "climb") {
          const feathers = Math.max(1, Math.round(foxBounty(state) * ROUT_BOUNTY_PCT));
          state.feathers += feathers;
          bump(state, "foxes");
          emit(state, { type: "fox-routed", fox: f, feathers });
        }
        f.state = "flee";
      }
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

/** The spawn lottery — plain foxes only until the gallery unlocks. */
function pickKind(state: SimState, rng: () => number): FoxKind {
  if ((state.stats.nights ?? 0) < ROGUE_NIGHTS) return "fox";
  let roll = rng() * (FOX_KINDS.fox.weight + FOX_KINDS.sneak.weight + FOX_KINDS.kit.weight + FOX_KINDS.bruiser.weight);
  for (const kind of ["fox", "sneak", "kit", "bruiser"] as const) {
    roll -= FOX_KINDS[kind].weight;
    if (roll < 0) return kind;
  }
  return "fox";
}

function shooFox(state: SimState, fox: Fox, byGuard: boolean): void {
  if (fox.state === "climb") {
    if (fox.hp > 1) {
      // a bruiser soaks the first tap — staggered, not stopped
      fox.hp--;
      fox.pauseT = STAGGER_TIME;
      emit(state, { type: "fox-staggered", fox });
      return;
    }
    fox.state = "flee";
    const feathers = Math.max(1, Math.round(foxBounty(state) * FOX_KINDS[fox.kind].bounty));
    state.feathers += feathers;
    bump(state, "foxes");
    emit(state, { type: "fox-shooed", fox, feathers, byGuard });
  } else if (fox.carrying || fox.bird !== undefined) {
    // Steal-and-flee rescue (Dan's pick): a tap on the escape makes the fox
    // drop the loot. The rescue IS the reward — no bounty on top, or letting
    // foxes steal first would always beat shooing them early.
    if (fox.bird !== undefined) {
      state.counts[fox.bird]++;
      bump(state, "birdsSaved");
      emit(state, { type: "fox-dropped-bird", fox, species: fox.bird });
      fox.bird = undefined;
    } else if (fox.loot) {
      const egg = rescueEgg(state, fox.loot.species, fox.loot.golden, fox.x, fox.y);
      if (!egg) return; // egg pool jammed — the fox gets away with it
      emit(state, { type: "fox-dropped", fox, egg });
    }
    fox.carrying = false;
    fox.loot = undefined;
  }
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
    const interceptable = f.state === "flee" && (f.carrying || f.bird !== undefined);
    if ((f.state === "climb" || interceptable) && segDist2(f.x, f.y, x1, y1, x2, y2) <= r2)
      shooFox(state, f, false);
  }
}

/** Where the Night guards stand watch — just below the roost. */
export const guardLineY = (state: SimState): number =>
  state.layout.hayTop * GUARD_LINE_RATIO;

/** Watchman i of `of` — one formula shared by sim hit-tests and the render. */
export const guardX = (state: SimState, i: number, of: number): number =>
  (state.layout.w * (i + 1)) / (of + 1);

/**
 * Tap-to-lunge (Dan's pick): a tap on a charged watchman sends him at every
 * fox around him — climbers shooed, loot-carriers intercepted, bruisers
 * unimpressed. No whiffs: the charge is only spent if he connects.
 */
export function lungeGuard(state: SimState, x: number, y: number): boolean {
  const g = Math.min(lvl(state, "guard"), 3);
  if (!state.clock.night || g < 1 || state.guardT > 0) return false;
  const lineY = guardLineY(state) + 20; // watchmen stand a step below the line
  if (Math.abs(y - lineY) > GUARD_TAP_R + 16) return false;
  let gx = -1;
  for (let i = 0; i < g; i++) {
    const cx = guardX(state, i, g);
    if (Math.abs(x - cx) <= GUARD_TAP_R) {
      gx = cx;
      break;
    }
  }
  if (gx < 0) return false;
  const r2 = GUARD_LUNGE_R * GUARD_LUNGE_R;
  let count = 0;
  for (let i = state.foxes.length - 1; i >= 0; i--) {
    const f = state.foxes[i];
    if (f.kind === "bruiser") continue; // shrugs the watch off entirely
    const interceptable = f.state === "flee" && (f.carrying || f.bird !== undefined);
    if (f.state !== "climb" && !interceptable) continue;
    const dx = f.x - gx;
    const dy = f.y - lineY;
    if (dx * dx + dy * dy > r2) continue;
    shooFox(state, f, true);
    count++;
  }
  if (count === 0) return false;
  state.guardT = GUARD_INTERVAL[Math.min(g, GUARD_INTERVAL.length - 1)];
  emit(state, { type: "guard-lunge", x: gx, count });
  return true;
}

/** Witching-hour spawn gap: wide at dusk, tight before dawn. */
function spawnGap(state: SimState, rng: () => number): number {
  const p = Math.min(1, Math.max(0, (state.clock.t - DAY_LENGTH) / NIGHT_LENGTH));
  const ramp = Math.pow(p, WITCHING_CURVE);
  const min = FOX_SPAWN_EARLY_MIN + (FOX_SPAWN_LATE_MIN - FOX_SPAWN_EARLY_MIN) * ramp;
  const vary = FOX_SPAWN_EARLY_VAR + (FOX_SPAWN_LATE_VAR - FOX_SPAWN_EARLY_VAR) * ramp;
  return min + rng() * vary;
}

export function updateFoxes(state: SimState, dt: number, rng: () => number): void {
  const { h, w, hayBottom } = state.layout;
  if (state.guardT > 0) state.guardT -= dt; // the watch recharges
  if (state.clock.night) {
    // new foxes slink in from below the road, faster as the night deepens
    if (state.nextFoxIn <= 0) state.nextFoxIn = spawnGap(state, rng);
    state.nextFoxIn -= dt;
    if (state.nextFoxIn <= 0) {
      state.nextFoxIn = spawnGap(state, rng);
      const kind = pickKind(state, rng);
      const pack = kind === "kit" ? KIT_PACK : 1;
      const baseX = 30 + rng() * Math.max(w - 60, 60);
      for (let k = 0; k < pack; k++) {
        state.foxes.push({
          id: state.foxSeq++,
          x: Math.min(Math.max(baseX + (k - (pack - 1) / 2) * KIT_SPREAD, 20), w - 20),
          y: h + 24 + k * 14,
          state: "climb",
          kind,
          hp: FOX_KINDS[kind].taps,
          pauseT: 0,
          moveT: SNEAK_DASH,
          carrying: false,
        });
      }
    }
  }
  const g = lvl(state, "guard");
  for (let i = state.foxes.length - 1; i >= 0; i--) {
    const f = state.foxes[i];
    if (f.state === "climb") {
      if (f.pauseT > 0) {
        f.pauseT -= dt; // hiding in the grass, or rattled by a tap
      } else {
        f.y -= FOX_KINDS[f.kind].speed * dt;
        if (f.kind === "sneak") {
          f.moveT -= dt;
          if (f.moveT <= 0) {
            f.pauseT = SNEAK_HIDE;
            f.moveT = SNEAK_DASH;
          }
        }
      }
      // The patrol line: a READY guard shoos the fox that crosses it, then
      // recharges — a second fox close behind gets through to the flock.
      // Bruisers walk straight through; only the player can turn them.
      if (g >= 1 && state.guardT <= 0 && f.kind !== "bruiser" && f.y <= guardLineY(state)) {
        shooFox(state, f, true);
        state.guardT = GUARD_INTERVAL[Math.min(g, GUARD_INTERVAL.length - 1)];
        continue;
      }
      if (f.y <= hayBottom) {
        // made it to the hay: grab the oldest unclaimed egg and bolt …
        const egg = state.ground.find((e) => !e.rush && !e.claimed);
        if (egg) {
          f.loot = { species: egg.species, golden: egg.golden };
          releaseEgg(state, egg);
          f.carrying = true;
          f.state = "flee";
          emit(state, { type: "fox-stole", fox: f, egg });
        } else if (f.y <= state.layout.hayTop * FOX_BIRD_DEPTH) {
          // … but an EMPTY hay line lets it through to the flock itself.
          // Capped per night and never a species' last bird — irritating,
          // not game ending (bird prices drop with the count, too). Kits
          // are too small to carry a hen — they turn back empty-pawed.
          if (f.kind !== "kit" && state.nightBirdThefts < FOX_BIRD_CAP) {
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

// Species table. Structure from the prototype; VALUES are the PLAN.md
// Phase 0 era-indexed economy (egg value ~×30 per tier) — the prototype's
// numbers are superseded, see the note atop CLAUDE.md.

export interface SpeciesDef {
  name: string;
  plural: string;
  unlock: number;    // money cost of the tree node that unlocks this bird
  birdBase: number;  // first-bird cost; grows by `growth^owned`
  growth: number;
  eggValue: number;  // base egg sale value
  interval: number;  // seconds per egg per bird (before lay-speed upgrades)
  eggScale: number;  // sprite scale for this species' egg
}

export const SPECIES: SpeciesDef[] = [
  { name: "Chicken", plural: "Chickens",  unlock: 0,          birdBase: 50,       growth: 1.35, eggValue: 10,      interval: 4.0,  eggScale: 3.0 },
  { name: "Duck",    plural: "Ducks",     unlock: 2500,       birdBase: 600,      growth: 1.35, eggValue: 300,     interval: 5.0,  eggScale: 3.5 },
  { name: "Quail",   plural: "Quail",     unlock: 150000,     birdBase: 18000,    growth: 1.35, eggValue: 9000,    interval: 1.6,  eggScale: 2.2 },
  { name: "Goose",   plural: "Geese",     unlock: 8000000,    birdBase: 500000,   growth: 1.40, eggValue: 250000,  interval: 8.0,  eggScale: 4.5 },
  { name: "Ostrich", plural: "Ostriches", unlock: 400000000,  birdBase: 16000000, growth: 1.45, eggValue: 8000000, interval: 14.0, eggScale: 6.5 },
];

// Gameplay caps and constants (see CLAUDE.md before changing)
export const EGG_CAP = 120;       // ground + falling eggs; oldest spoils beyond this (doubles during a Golden Rush)
export const EGG_LIFE = 25;       // seconds before a ground egg spoils
export const BIRD_VIEW_CAP = 22;  // rendered birds per species (sim count may exceed)
export const BASKET_BASE_CAP = 12;
export const TRUCK_SCHEDULE = [0, 20, 14, 9, 6, 4]; // seconds, by ttime level (steepened: full baskets used to always preempt the countdown)

// --- species gimmicks (fun pass, 2026-07-05) --------------------------------
// Each later bird plays differently, not just bigger. All three reward the
// active player; collectors and idle income are untouched.
export const QUAIL_CLUSTER_PCT = 0.2; // chance a quail lay is a whole burst …
export const QUAIL_CLUSTER_SIZE = 3;  // … of this many eggs, landing together
export const GOOSE_SHINE_TIME = 6;    // a goose egg sparkles this long after landing
export const GOOSE_SHINE_MULT = 1.5;  // sweep it while sparkling for +50%
export const OSTRICH_ROLL_MIN = 30;   // px/s roll speed on landing …
export const OSTRICH_ROLL_VAR = 50;   // … plus up to this much, random direction
export const OSTRICH_ROLL_DRAG = 1.1; // fraction of roll speed lost per second
export const OSTRICH_SMASH_R = 70;    // sweep a ROLLING egg: everything nearby flies too

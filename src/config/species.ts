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
export const EGG_CAP = 80;        // ground + falling eggs; oldest spoils beyond this
export const EGG_LIFE = 25;       // seconds before a ground egg spoils
export const BIRD_VIEW_CAP = 22;  // rendered birds per species (sim count may exceed)
export const BASKET_BASE_CAP = 12;
export const TRUCK_SCHEDULE = [0, 30, 24, 18, 14, 10]; // seconds, by ttime level

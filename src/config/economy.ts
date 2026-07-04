// PLAN.md Phase 0 — every economy curve lives here, nothing inline.
// The pacing bands below ARE the balance spec: the tables are tuned until
// src/sim/pacing.test.ts passes, and those tests guard every later phase.

// --- upgrade effects ------------------------------------------------------
/** Egg worth per w-node level (Phase 0 steepened ×1.25 → ×1.5; ×7.6 at max). */
export const WORTH_PER_LVL = 1.5;

/**
 * Base feathers per egg by species tier (golden = ×FEATHER_GOLDEN_MULT of
 * this), multiplied by the Feathered Eggs node: income ×(1 + fth level).
 * PLAN's opening targets were [1,4,10,25,60]; steepened so late-era feather
 * income keeps pace with the 12^tier cost indexing (bands are the spec).
 */
export const FEATHERS_BY_TIER = [1, 6, 34, 500, 7500];
export const FEATHER_GOLDEN_MULT = 15;

// --- Phase 3 support-node effects ------------------------------------------
export const ECAP_PER_LVL = 20; //      Roomier hay: +20 ground egg cap
export const ESPOIL_PER_LVL = 5; //     Fresh eggs: +5s spoil time
export const SWEEP_R_PER_LVL = 8; //    Wider sweep: +8px swipe radius
export const COMBO_VALUE_PER_LVL = 0.05; // Hot streak: swiped streak eggs +5%
export const COMBO_WINDOW = 0.45; //    seconds between sweeps to keep a streak
export const GOLD2_BONUS_FEATHERS = 1; // Midas flock: instant 🪶 per golden swept
export const BIRDLOT_GROWTH_PER_LVL = 0.02; // Bulk deals: bird cost growth −0.02

// --- cost indexing --------------------------------------------------------
/** Species-branch feather costs scale 12^(tier−1) — geometric, not linear. */
export const costTierMult = (tier: number): number => Math.pow(12, tier - 1);

/** Species-branch node costs (feathers): base × costTierMult × growth^lvl. */
export const SPECIES_NODE_COSTS = {
  w: { base: 50, growth: 1.75 },
  s: { base: 52, growth: 1.7 },
  g: { base: 52, growth: 1.7 },
} as const;

/** Farm/collector branch costs (feathers): base × growth^lvl. */
export const FARM_NODE_COSTS = {
  bsize: { base: 600, growth: 1.9 },
  tspd: { base: 8000, growth: 1.9 },
  ttime: { base: 12000, growth: 1.7 },
  coll: { base: 900, growth: 1 },
  cspd: { base: 12000, growth: 1.6 },
  cbag: { base: 60000, growth: 1.8 },
  cval: { base: 90000, growth: 1.8 },
  fth: { base: 850000, growth: 1.8 },
  // Phase 3 support nodes (era-indexed via the pacing bands)
  ecap: { base: 9000, growth: 2.0 },
  espoil: { base: 80000, growth: 2.0 },
  sweep: { base: 14000, growth: 2.6 },
  combo: { base: 16000, growth: 2.6 },
  gold2: { base: 100000, growth: 1 },
  birdlot: { base: 90000, growth: 3.0 },
} as const;

/** Extra basket prices (money), one per bextra level (duck/quail/goose era). */
export const BASKET_COSTS = [60000, 4000000, 100000000];

/** Collector hire prices (money), one per hire level (era-indexed). */
export const HIRE_COSTS = [30000, 2500000, 80000000, 700000000, 1000000000];

// --- pacing bands (seconds of checkpoint income) ---------------------------
export const PACING_BANDS = {
  /** First level of a newly-revealed node: 1–3 minutes, its own currency. */
  firstLevel: [60, 180],
  /** Maxing a whole branch: 20–40 minutes cumulative. */
  branchTotal: [1200, 2400],
  /** Unlocking the next species: 5–15 minutes of the previous era's income. */
  speciesUnlock: [300, 900],
} as const;

// --- era checkpoints -------------------------------------------------------
// Shared by the pacing tests AND the ?dev=1 admin panel (era-jump presets),
// so they can never drift apart. Each is a "typical" loadout the moment that
// era opens up: flocks and upgrades a player would plausibly have.
export interface Checkpoint {
  id: string;
  label: string;
  money: number;
  feathers: number;
  counts: number[];
  n: Record<string, number>;
}

export const CHECKPOINTS: Checkpoint[] = [
  {
    id: "fresh",
    label: "Fresh start",
    money: 0,
    feathers: 0,
    counts: [2, 0, 0, 0, 0],
    n: { sp0: 1 },
  },
  {
    id: "ducks",
    label: "Just unlocked ducks",
    money: 600,
    feathers: 80,
    counts: [9, 4, 0, 0, 0],
    n: { sp0: 1, sp1: 1, w0: 2, s0: 1 },
  },
  {
    id: "quail",
    label: "Quail era",
    money: 30000,
    feathers: 4000,
    counts: [12, 10, 3, 0, 0],
    n: {
      sp0: 1, sp1: 1, sp2: 1,
      w0: 4, s0: 2, g0: 1,
      w1: 3, s1: 2, g1: 1,
      bsize: 2, bextra: 1, coll: 1, hire: 1,
    },
  },
  {
    id: "goose",
    label: "Goose era",
    money: 2500000,
    feathers: 150000,
    counts: [12, 12, 12, 5, 0],
    n: {
      sp0: 1, sp1: 1, sp2: 1, sp3: 1,
      w0: 5, s0: 3, g0: 2,
      w1: 4, s1: 3, g1: 2,
      w2: 4, s2: 2, g2: 1,
      bsize: 3, bextra: 2, tspd: 2, ttime: 1,
      coll: 1, hire: 2, cspd: 2, cbag: 1,
      ecap: 2, sweep: 1, combo: 1,
    },
  },
  {
    id: "ostrich",
    label: "Ostrich era",
    money: 150000000,
    feathers: 8000000,
    counts: [12, 12, 16, 10, 3],
    n: {
      sp0: 1, sp1: 1, sp2: 1, sp3: 1, sp4: 1,
      w0: 5, s0: 4, g0: 3,
      w1: 5, s1: 4, g1: 3,
      w2: 5, s2: 3, g2: 2,
      w3: 4, s3: 3, g3: 2,
      bsize: 4, bextra: 3, tspd: 3, ttime: 2,
      coll: 1, hire: 3, cspd: 3, cbag: 2, cval: 1, fth: 1,
      ecap: 3, espoil: 1, sweep: 2, combo: 2, gold2: 1, birdlot: 1,
    },
  },
  {
    id: "full",
    label: "Full tree",
    money: 1000000000000,
    feathers: 100000000,
    counts: [20, 20, 22, 18, 12],
    n: {
      sp0: 1, sp1: 1, sp2: 1, sp3: 1, sp4: 1,
      w0: 5, s0: 5, g0: 5,
      w1: 5, s1: 5, g1: 5,
      w2: 5, s2: 5, g2: 5,
      w3: 5, s3: 5, g3: 5,
      w4: 5, s4: 5, g4: 5,
      bsize: 5, bextra: 3, tspd: 5, ttime: 5,
      coll: 1, hire: 5, cspd: 5, cbag: 5, cval: 5, fth: 5,
      ecap: 4, espoil: 4, sweep: 3, combo: 3, gold2: 1, birdlot: 3,
    },
  },
];

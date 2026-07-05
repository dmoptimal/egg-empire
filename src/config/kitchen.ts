// The Kitchen (PLAN.md Phase 4) — every kitchen balance number lives here.
// Stations unlock in order via the Phase 6 tree nodes (their ids are wired
// already so the sim is testable headless before the tree branch exists).

export interface StationDef {
  id: string;        // Phase 6 tree node id that unlocks it
  name: string;
  eggsIn: number;
  cookTime: number;  // seconds, before Faster pans (ckspd ×0.9/lvl)
  valueMult: number; // dish value = Σ input egg values × this (× Secret seasoning)
  chefSlots: number; // base slots; Sous chefs (chefs2) adds +1 per level
}

export const STATIONS: StationDef[] = [
  { id: "st_boil", name: "Boiled",    eggsIn: 1, cookTime: 4,  valueMult: 3,  chefSlots: 3 },
  { id: "st_fry",  name: "Fried",     eggsIn: 1, cookTime: 6,  valueMult: 5,  chefSlots: 3 },
  { id: "st_scr",  name: "Scrambled", eggsIn: 2, cookTime: 8,  valueMult: 9,  chefSlots: 3 },
  { id: "st_poa",  name: "Poached",   eggsIn: 1, cookTime: 12, valueMult: 16, chefSlots: 3 },
  { id: "st_oml",  name: "Omelette",  eggsIn: 3, cookTime: 18, valueMult: 45, chefSlots: 3 },
];

/** The Kitchen gate node price (money, duck era per the pacing bands). */
export const KITCHEN_UNLOCK_COST = 250000;

/**
 * Station unlock prices (money), one per station in order — pulled forward
 * from Phase 6 so the kitchen is playable the moment its screen exists.
 * Omelette lands like a species unlock (PLAN: the late-game spike).
 */
export const STATION_COSTS = [50000, 3000000, 80000000, 800000000, 3000000000];

export const PANTRY_BASE_CAP = 30;
export const PANTRY_CAP_PER_LVL = 30; //  Phase 6 "Bigger pantry" (pantry node)
export const COUNTER_BASE_CAP = 20;
export const COUNTER_CAP_PER_LVL = 20; // Phase 6 "Long counter" (counter node)
export const CKSPD_FACTOR = 0.9; //      Phase 6 "Faster pans" per level
export const CKVAL_PER_LVL = 0.1; //     Phase 6 "Secret seasoning" per level
export const CHEFS2_SLOTS_PER_LVL = 1; // Phase 6 "Sous chefs" per level

// --- tap-to-plate (fun pass #3, Dan's design) -------------------------------
export const PLATE_WINDOW = 3; //   seconds a finished dish sizzles awaiting a tap
export const PERFECT_MULT = 1.5; // tapped-in-time dishes pay +50%

// --- customers (Dan's kitchen overhaul, 2026-07-05) --------------------------
// Walk-in customers replace the old ticket rail. Each one claims dishes that
// are actually ON the counter when they walk in (claims never overlap), so an
// order is always servable — the delivery shelf, not the counter, feeds the
// truck, so nothing can yank a claimed dish away.
export const CUSTOMER_MAX = 3; //          queue spots at the counter
export const CUSTOMER_INTERVAL_MIN = 5; // seconds between walk-ins …
export const CUSTOMER_INTERVAL_VAR = 5; // … plus up to this much
export const CUSTOMER_PATIENCE = 30; //    seconds they wait before storming off
export const CUSTOMER_WALK_SPEED = 130; // px/s along the kitchen floor
export const CUSTOMER_MAX_ITEMS = 3; //    most dishes one customer claims
export const CUSTOMER_MONEY_MULT = 2.5; // served dishes pay ×2.5 money …
export const CUSTOMER_FEATHER_MULT = 2; // … and ×2 feathers

// --- Dinner Rush (unlocked via the `krush` node) ------------------------------
export const KRUSH_INTERVAL_MIN = 60; //  seconds between VIP walk-ins …
export const KRUSH_INTERVAL_VAR = 45; //  … plus up to this much
export const KRUSH_BASE_DURATION = 12; // rush length at level 1
export const KRUSH_DURATION_PER_LVL = 4; // +4s per extra level
export const KRUSH_COOK_RATE = 2; //      pans cook ×2 while the rush runs
export const KRUSH_CUSTOMER_RATE = 3; //  customers arrive ×3 as often
export const VIP_PATIENCE = 15; //        greet the VIP within this or lose the rush

/**
 * Chef hire prices per station (money), growing per chef already hired
 * there. Era-indexed to when each station typically unlocks; Phase 6's
 * completion-pacing pass re-derives these if needed.
 */
export const CHEF_COSTS: { base: number; growth: number }[] = [
  { base: 60000, growth: 3 },        // boiled — duck era
  { base: 2000000, growth: 3 },      // fried — quail era
  { base: 100000000, growth: 3 },    // scrambled — goose era
  { base: 1500000000, growth: 3 },   // poached — late goose / early ostrich
  { base: 25000000000, growth: 3 },  // omelette — ostrich era
];

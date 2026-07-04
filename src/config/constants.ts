// Gameplay tuning extracted verbatim from prototype/egg-empire.html —
// everything that isn't in the species/nodes tables. Values must match the
// prototype exactly (CLAUDE.md: it is the source of truth for feel/balance).

// --- layout (fractions of canvas size; see layout() in the prototype) ---
export const HAY_TOP_RATIO = 0.5; //   fence line: field above, hay below
export const ROAD_Y_RATIO = 0.87; //   road centreline
export const HAY_BOTTOM_FROM_ROAD = 26; // hayBottom = roadY - 26
export const BASKET_Y_OFFSET = 2; //   basketY = hayBottom + 2
export const BASKET_X_FROM_RIGHT = 52; // basket i sits at W - 52 - i*66
export const BASKET_X_SPACING = 66;

// --- bird field (egg spawn falls back to this band when headless) ---
export const BIRD_MIN_X = 24; //       birds waddle in x ∈ [24, W-24]
export const BIRD_MIN_Y = 92; //       and y ∈ [92, hayTop-30]
export const BIRD_MAX_Y_INSET = 30;
export const BIRD_SPAWN_BAND = 140; // spawn y = 92 + rng*max(hayTop-140, 60)
export const BIRD_SPAWN_BAND_MIN = 60;

// --- egg physics ---
export const EGG_GRAVITY = 680;
export const EGG_INITIAL_VY = 30;
export const EGG_BOUNCE_MIN_VY = 220; // slower impacts settle without a bounce
export const EGG_BOUNCE_RESTITUTION = -0.2;
export const EGG_SPAWN_JITTER_X = 10; // ± around the laying bird
export const EGG_SPAWN_Y_OFFSET = 6; //  egg starts 6px above the bird anchor
export const EGG_TARGET_TOP_INSET = 14; // targetY ∈ [hayTop+14, hayBottom-4]
export const EGG_TARGET_BAND_INSET = 18;
export const EGG_FLY_TIME = 0.45; //   collect → basket flight, seconds
export const EGG_ARC_LIFT = 110; //    flight bezier control-point lift (render)
export const EGG_FADE_TIME = 3; //     spoil fade-out window (render)
export const EGG_POOL_EXTRA = 40; //   in-flight allowance beyond EGG_CAP

// --- laying ---
export const LAY_BURST_MAX = 6; //     eggs per species per frame
export const LAY_ACC_MAX = 8; //       accumulator clamp

// --- player collection ---
export const SWEEP_RADIUS = 46;
export const FULL_WARN_COOLDOWN = 0.7; // "Baskets full!" warning rate limit

// --- upgrade / economy multipliers ---
// (worth-per-level and the feather income model moved to config/economy.ts
// in PLAN Phase 0 — all tuned curves live there.)
export const LAY_SPEED_FACTOR = 0.9; //   lay interval ×0.90 per s-node level
export const GOLDEN_BASE = 0.02;
export const GOLDEN_PER_LVL = 0.02;
export const GOLDEN_VALUE_MULT = 10;
export const BASKET_CAP_PER_LVL = 6; //   on top of BASKET_BASE_CAP

// --- trucks ---
export const TRUCK_SPEED_IN_BASE = 300;
export const TRUCK_SPEED_OUT_BASE = 340;
export const TRUCK_SPEED_GROWTH = 1.3; //  per tspd level
export const TRUCK_PAUSE_BASE = 0.9; //    loading pause at the basket
export const TRUCK_PAUSE_FACTOR = 0.92; // per tspd level
export const TRUCK_START_X = -120;
export const TRUCK_DISPATCH_X = -80;
export const TRUCK_STOP_OFFSET = 10; //    truck stops at basket.x - 10
export const TRUCK_EXIT_MARGIN = 90; //    despawns once x > W + 90

// --- saves / offline progress (NEW work, README step 6 — not in prototype) ---
export const OFFLINE_CAP_SECONDS = 8 * 3600; // idle income accrues for at most 8h away

// --- collectors ---
export const COLL_SPEED_BASE = 130;
export const COLL_SPEED_GROWTH = 1.25; //  per cspd level
export const COLL_VALUE_PER_LVL = 0.1; //  Gentle Hands bonus per cval level
export const COLL_BAG_BASE = 1;
export const COLL_PICKUP_DIST = 14;
export const COLL_DEPOSIT_DIST = 16;
export const COLL_DEPOSIT_OFFSET_X = 26; // stands 26px left of the basket
export const COLL_SPAWN_OFFSET_X = 40; //  spawns 40px left of basket 0

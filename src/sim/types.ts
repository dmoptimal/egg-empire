// Sim-side types: plain data only — no pixi, no DOM (CLAUDE.md two-system
// rule). Sprites, tweens and particles map onto this state from src/render/,
// never the reverse. Everything here must work headless under vitest.

export type EggPhase = "falling" | "ground" | "flying" | "gone";

export interface Egg {
  id: number;
  species: number;
  golden: boolean;
  /** Sale value, fixed at lay time (worth upgrades apply then, ×10 golden). */
  value: number;
  /**
   * Gameplay position. Valid while falling/ground (sweep + collectors hit-test
   * it). While flying it is stale — render derives the arc from sx/sy/tx/ty
   * and flyT (control point: midpoint x, min(sy,ty) - EGG_ARC_LIFT).
   */
  x: number;
  y: number;
  vy: number;
  /** Hay landing y, chosen at lay time. */
  targetY: number;
  /** Seconds since landing; spoils past EGG_LIFE (render fades the last 3s). */
  age: number;
  /** Reserved by a collector or already swept — skipped by collection. */
  claimed: boolean;
  bounced: boolean;
  /** A shimmer egg: sweeping it triggers a Golden Rush instead of value. */
  rush?: boolean;
  /**
   * Horizontal roll velocity — ostrich eggs land rolling (updateGround moves
   * and decays it). Sweeping an egg that is still rolling smashes every
   * ground egg within OSTRICH_SMASH_R into the baskets with it.
   */
  vx?: number;
  phase: EggPhase;
  /** Flight progress 0→1 (advances by dt / EGG_FLY_TIME). */
  flyT: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  /** Deposit target while flying. */
  basket: Basket | null;
}

export type TruckPhase = "idle" | "in" | "load" | "out";

export interface Basket {
  /** Layout-owned: W - 52 - index*66, recomputed on resize. */
  x: number;
  /** Per-egg detail of the current load — the kitchen routes from this. */
  load: BagEgg[];
  count: number;
  /** Money paid out when the truck collects. */
  value: number;
  /** Feathers paid out when the truck collects. */
  feathers: number;
  truckState: TruckPhase;
  truckX: number;
  truckPause: number;
  /** Schedule accumulator — only advances while the basket holds ≥1 egg. */
  sched: number;
}

export type CollectorMode = "idle" | "seek" | "carry";

export interface BagEgg {
  /** Value after the Gentle Hands multiplier, applied at pickup. */
  value: number;
  golden: boolean;
  species: number;
}

export interface Collector {
  x: number;
  y: number;
  /** Last horizontal movement direction (render flips the sprite). */
  facing: 1 | -1;
  mode: CollectorMode;
  target: Egg | null;
  bag: BagEgg[];
  dest: Basket | null;
}

/** A pachinko egg mid-fall (the Bird Casino). */
export interface CasinoBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Current worth — grows a touch per pin hit, multiplied by the bin. */
  value: number;
  species: number;
  golden: boolean;
  /** Double-yolk splits used (children can't split again). */
  splits: number;
}

export type FoxState = "climb" | "flee";

/** A night fox — sim-owned position like eggs/collectors/customers. */
export interface Fox {
  id: number;
  x: number;
  y: number;
  state: FoxState;
  /** It reached the hay and made off with an egg (render shows it). */
  carrying: boolean;
  /** It got through an empty hay line and took a bird of this species. */
  bird?: number;
}

export interface Layout {
  w: number;
  h: number;
  hayTop: number;
  hayBottom: number;
  roadY: number;
  basketY: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

/**
 * Host-injected effects. The render layer supplies a spawnPoint that returns a
 * random visible bird sprite's position (so eggs visually drop from birds);
 * headless callers omit it and eggs spawn across the default bird band.
 * Returning null skips that lay (prototype: no bird view yet).
 */
export interface SimHooks {
  rng: () => number;
  spawnPoint?: (species: number) => SpawnPoint | null;
}

export interface Dish {
  station: number;
  value: number;
  feathers: number;
  golden: boolean;
}

export interface CookJob {
  station: number;
  /**
   * Seconds of cooking left. At t ≤ 0 the dish sizzles READY in the pan:
   * tap the station within PLATE_WINDOW for a Perfect (+50%) plate, or it
   * auto-plates at base value when t reaches -PLATE_WINDOW (idle-safe).
   */
  t: number;
  value: number;
  feathers: number;
  golden: boolean;
}

export type CustomerState = "in" | "wait" | "leave";

/**
 * A walk-in customer. Gameplay entity like eggs/collectors: the sim owns the
 * position (they stroll along the kitchen floor to a queue slot), the render
 * maps a sprite + ticket bubble onto it. `needs` is claimed from dishes that
 * were unclaimed on the counter at walk-in time, so serving is always
 * possible — nothing else removes counter dishes (the truck takes the
 * delivery shelf instead).
 */
export interface Customer {
  id: number;
  /** Dishes claimed per station index (all zero for a VIP). */
  needs: number[];
  x: number;
  /** Queue slot 0..CUSTOMER_MAX-1 — sets the standing spot. */
  slot: number;
  state: CustomerState;
  /** Seconds left before they give up; ticks while waiting only. */
  patience: number;
  /** Stable palette index for the render. */
  look: number;
  /** A VIP guest: greeting them starts a Dinner Rush instead of a sale. */
  vip: boolean;
  /** Leaving mood (render: heart vs huff). */
  happy: boolean;
}

export interface KitchenTruck {
  truckState: TruckPhase;
  truckX: number;
  truckPause: number;
  sched: number;
}

export interface KitchenState {
  /** Raw eggs awaiting a pan (each carries value/golden/species). */
  pantry: BagEgg[];
  /** Chefs hired per station index. */
  chefs: number[];
  cooking: CookJob[];
  /** The customer section: dishes plate here first; customers claim these. */
  counter: Dish[];
  /** The truck section: overflow dishes stack here; the truck collects it. */
  delivery: Dish[];
  truck: KitchenTruck;
  customers: Customer[];
  nextCustomerIn: number;
  customerSeq: number;
  /** Dinner Rush: seconds of frenzy left / countdown to the next VIP. */
  krush: { active: number; next: number };
}

export type SimEvent =
  | { type: "egg-laid"; egg: Egg }
  | { type: "egg-bounced"; egg: Egg }
  | { type: "egg-spoiled"; egg: Egg }
  /** Silent removal: oldest egg evicted to hold the ground cap. */
  | { type: "egg-despawned"; egg: Egg }
  /** Player swept an egg — it is now flying to egg.basket. */
  | { type: "egg-collected"; egg: Egg }
  /** A collector grabbed a ground egg into its bag. */
  | { type: "egg-picked-up"; egg: Egg }
  /** Flight finished; basket count/value/feathers already updated. */
  | { type: "egg-deposited"; egg: Egg; basket: Basket }
  | { type: "baskets-full" }
  | { type: "truck-dispatched"; basket: Basket; index: number }
  | { type: "payout"; basket: Basket; index: number; money: number; feathers: number; count: number; routed: number }
  | { type: "node-bought"; id: string; level: number }
  | { type: "species-unlocked"; species: number }
  | { type: "bird-bought"; species: number; count: number }
  | { type: "rush-started"; duration: number; egg: Egg }
  | { type: "rush-ended" }
  /** A rolling ostrich egg was swept — `count` neighbours flew with it. */
  | { type: "strike"; egg: Egg; count: number }
  | { type: "nightfall" }
  | { type: "daybreak" }
  | { type: "fox-shooed"; fox: Fox; feathers: number; byGuard: boolean }
  | { type: "fox-stole"; fox: Fox; egg: Egg }
  /** The flock is one bird short — counts (and so bird prices) already updated. */
  | { type: "fox-stole-bird"; fox: Fox; species: number }
  | { type: "casino-drop"; ball: CasinoBall; auto: boolean }
  | { type: "casino-split"; ball: CasinoBall }
  | { type: "casino-payout"; ball: CasinoBall; bin: number; money: number }
  | { type: "roulette-spun"; bet: number }
  | { type: "roulette-stopped"; slice: number; mult: number; money: number; bet: number }
  | { type: "slots-spun"; bet: number }
  /** Lucky reels: the losing pull respins free, stake still live. */
  | { type: "slots-respin" }
  /** A reel thunked to a stop showing `symbol`. */
  | { type: "slots-reel"; reel: number; symbol: number }
  | { type: "slots-stopped"; symbols: number[]; run: number; mult: number; money: number; bet: number }
  /** One-shot progress toast (see sim/milestones.ts for the ids). */
  | { type: "milestone"; id: string }
  | { type: "dish-cooked"; dish: Dish; perfect: boolean; station: number; target: "counter" | "delivery" }
  | { type: "customer-arrived"; customer: Customer }
  | { type: "customer-served"; money: number; feathers: number; customer: Customer }
  /** Patience ran out — they left unserved (their claim is released). */
  | { type: "customer-left"; customer: Customer }
  | { type: "krush-started"; duration: number; customer: Customer }
  | { type: "krush-ended" }
  | { type: "chef-hired"; station: number; count: number }
  | { type: "kitchen-truck-dispatched" }
  | { type: "kitchen-payout"; money: number; feathers: number; dishes: number }
  | { type: "won" };

export interface SimState {
  money: number;
  feathers: number;
  totalDelivered: number;
  /** Owned birds per species (render caps sprites at BIRD_VIEW_CAP). */
  counts: number[];
  /** Fractional eggs-owed per species (fixed-accumulator laying). */
  layAcc: number[];
  /** Skill node levels by id; absent = 0. */
  n: Record<string, number>;
  won: boolean;
  layout: Layout;
  /**
   * Sim-owned egg lists (CLAUDE.md: eggs are gameplay entities). Array order
   * is meaningful and mirrors the prototype: ground[0] is the oldest (evicted
   * first at the cap); sweeps scan newest-first.
   */
  falling: Egg[];
  ground: Egg[];
  flying: Egg[];
  nextEggId: number;
  baskets: Basket[];
  collectors: Collector[];
  /** Cooldown for the "Baskets full!" warning. */
  fullWarnCd: number;
  /** Seconds since the player last swept an egg (Hot streak window). */
  comboT: number;
  /** Current sweep streak length (drives the combo meter). */
  comboN: number;
  /** Golden Rush: seconds of frenzy left / countdown to the next shimmer egg. */
  rush: { active: number; next: number };
  /** One-shot milestones already toasted (persisted so they never re-fire). */
  milestones: Record<string, number>;
  /** Lifetime counters for the stats screen (persisted; see sim/stats.ts). */
  stats: Record<string, number>;
  /** Toast spacing cooldown so milestone bursts don't stack. */
  msCd: number;
  /** Day/night cycle: seconds into the cycle; night = past DAY_LENGTH. */
  clock: { t: number; night: boolean };
  foxes: Fox[];
  nextFoxIn: number;
  foxSeq: number;
  /** Night-guard auto-shoo cooldown. */
  guardT: number;
  /** Birds lost tonight (capped at FOX_BIRD_CAP; resets at nightfall). */
  nightBirdThefts: number;
  /** The Bird Casino — pachinko balls, the auto-drop timer, and the wheel. */
  casino: {
    balls: CasinoBall[];
    ballSeq: number;
    nextAuto: number;
    /** Roulette: wheel angle (rad), spin velocity (0 = at rest), live stake. */
    roulette: { angle: number; vel: number; bet: number };
    /** Slots: spin clock, drawn symbols, reels revealed so far, live stake. */
    slots: { t: number; result: number[]; revealed: number; bet: number };
  };
  kitchen: KitchenState;
  /** Buffered events since the last drain — the render/audio seam. */
  events: SimEvent[];
}

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
  | { type: "payout"; basket: Basket; index: number; money: number; feathers: number; count: number }
  | { type: "node-bought"; id: string; level: number }
  | { type: "species-unlocked"; species: number }
  | { type: "bird-bought"; species: number; count: number }
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
  /** Buffered events since the last drain — the render/audio seam. */
  events: SimEvent[];
}

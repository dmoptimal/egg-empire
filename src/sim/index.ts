// Public sim API. Pure TS over plain state: every function takes the state
// (plus injected hooks where randomness/spawn positions are needed) and
// mutates it in place, exactly like the prototype's globals — but headless.
// Render/audio/ui react via drainEvents(); they never reach into the sim.

export * from "./types";
export { createSim, DEFAULT_HOOKS, type CreateSimOptions } from "./state";
export { tick, type HeldPointer } from "./tick";
export { drainEvents, emit } from "./events";
export { computeLayout, resize, applyBasketXs } from "./layout";
export {
  lvl,
  unlocked,
  birdCost,
  worthMult,
  layIntv,
  goldenPct,
  basketCap,
  truckSpeedIn,
  truckSpeedOut,
  truckPause,
  truckSchedule,
  collSpeed,
  collBagCap,
  collValueMult,
  featherPerEgg,
  featherGolden,
  totalBirds,
} from "./economy";
export { layEgg, collectEgg, releaseEgg } from "./eggs";
export { sweepCollect, segDist2 } from "./collect";
export { addBasket, basketWithSpace, truckCountdown, updateTruck } from "./baskets";
export { addCollector, updateCollector } from "./collectors";
export {
  nodeCost,
  canAfford,
  nodeState,
  treeComplete,
  buyNode,
  buyBird,
  type NodeVisualState,
} from "./tree";
export {
  serialize,
  restore,
  estimateOfflineIncome,
  SAVE_VERSION,
  type SaveData,
  type OfflineIncome,
} from "./save";
export { checkpointToSave, checkpointSim, moneyRate, featherRate } from "./pacing";

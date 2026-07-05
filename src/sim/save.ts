// Save data + offline progress (README step 6 — NEW work, no prototype
// counterpart). Pure and headless: serialization is plain JSON in/out, and
// the browser side (localStorage, timestamps) lives in src/storage.ts.
// Only the durable economy is saved — eggs on the ground, trucks mid-run and
// collector errands are ephemeral and restart cleanly.

import { GOLDEN_VALUE_MULT, OFFLINE_CAP_SECONDS } from "../config/constants";
import { SPECIES } from "../config/species";
import { addBasket } from "./baskets";
import { addCollector } from "./collectors";
import {
  collValueMult,
  featherGolden,
  featherPerEgg,
  goldenPct,
  layIntv,
  lvl,
  truckSchedule,
  unlocked,
  worthMult,
} from "./economy";
import { createSim, type CreateSimOptions } from "./state";
import type { SimState } from "./types";

export const SAVE_VERSION = 1;

/** Persisted skill-tree camera (PLAN Phase 2: the tree remembers your view). */
export interface TreeView {
  x: number;
  y: number;
  s: number;
}

export interface SaveData {
  v: number;
  money: number;
  feathers: number;
  totalDelivered: number;
  counts: number[];
  n: Record<string, number>;
  won: boolean;
  /** Epoch ms, stamped by the storage layer at write time. */
  lastSeen: number;
  /** Optional UI state — absent on old saves (first open centres the root). */
  treeView?: TreeView;
  /** Chefs hired per kitchen station — absent on pre-kitchen saves. */
  chefs?: number[];
  /** Milestones already toasted — absent until the first one fires. */
  ms?: Record<string, number>;
  /** Lifetime stat counters — absent on older saves. */
  st?: Record<string, number>;
}

export function serialize(state: SimState, lastSeen: number, treeView?: TreeView): SaveData {
  const save: SaveData = {
    v: SAVE_VERSION,
    money: state.money,
    feathers: state.feathers,
    totalDelivered: state.totalDelivered,
    counts: [...state.counts],
    n: { ...state.n },
    won: state.won,
    lastSeen,
  };
  if (treeView) save.treeView = { ...treeView };
  if (state.kitchen.chefs.some((c) => c > 0)) save.chefs = [...state.kitchen.chefs];
  if (Object.keys(state.milestones).length > 0) save.ms = { ...state.milestones };
  if (Object.keys(state.stats).length > 0) save.st = { ...state.stats };
  return save;
}

/** The save's tree view if well-formed, else null (malformed is ignored). */
export function savedTreeView(save: SaveData): TreeView | null {
  const tv = save.treeView;
  if (!tv || typeof tv !== "object") return null;
  if (!finiteNumber(tv.x) || !finiteNumber(tv.y) || !finiteNumber(tv.s)) return null;
  return { x: tv.x, y: tv.y, s: tv.s };
}

const finiteNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Rebuild a live sim from a save, or return null when the save is from a
 * different version or malformed (callers then start a fresh game). Baskets
 * and collectors are recreated from the node levels that imply them.
 */
export function restore(save: SaveData, opts: CreateSimOptions = {}): SimState | null {
  if (typeof save !== "object" || save === null) return null;
  if (save.v !== SAVE_VERSION) return null;
  if (!finiteNumber(save.money) || !finiteNumber(save.feathers) || !finiteNumber(save.totalDelivered))
    return null;
  if (!Array.isArray(save.counts) || save.counts.length !== SPECIES.length || !save.counts.every(finiteNumber))
    return null;
  if (typeof save.n !== "object" || save.n === null) return null;
  for (const v of Object.values(save.n)) if (!finiteNumber(v)) return null;

  const state = createSim(opts);
  state.money = save.money;
  state.feathers = save.feathers;
  state.totalDelivered = save.totalDelivered;
  state.counts = [...save.counts];
  state.n = { ...save.n };
  state.won = !!save.won;
  for (let i = 0; i < lvl(state, "bextra"); i++) addBasket(state);
  for (let i = 0; i < lvl(state, "hire"); i++) addCollector(state);
  if (Array.isArray(save.chefs) && save.chefs.length === state.kitchen.chefs.length && save.chefs.every(finiteNumber))
    state.kitchen.chefs = [...save.chefs];
  if (typeof save.ms === "object" && save.ms !== null && Object.values(save.ms).every(finiteNumber))
    state.milestones = { ...save.ms };
  if (typeof save.st === "object" && save.st !== null && Object.values(save.st).every(finiteNumber))
    state.stats = { ...save.st };
  return state;
}

export interface OfflineIncome {
  money: number;
  feathers: number;
  /** Credited idle time after gating and the 8h cap; 0 = nothing accrued. */
  seconds: number;
}

/**
 * Estimate income earned while away. Idle income only counts when the farm
 * actually runs itself: a truck schedule (ttime ≥ 1) AND at least one hired
 * collector. The estimate mirrors live pricing — worth upgrades round before
 * the golden ×10, collector-gathered eggs get Gentle Hands, feathers scale
 * with golden chance — and is capped at OFFLINE_CAP_SECONDS.
 */
export function estimateOfflineIncome(state: SimState, elapsedSeconds: number): OfflineIncome {
  const seconds = Math.min(Math.max(elapsedSeconds, 0), OFFLINE_CAP_SECONDS);
  if (seconds <= 0 || truckSchedule(state) <= 0 || state.collectors.length === 0)
    return { money: 0, feathers: 0, seconds: 0 };
  let moneyPerSec = 0;
  let feathersPerSec = 0;
  for (let i = 0; i < SPECIES.length; i++) {
    if (!unlocked(state, i) || state.counts[i] === 0) continue;
    const eggsPerSec = state.counts[i] / layIntv(state, i);
    const base = Math.round(SPECIES[i].eggValue * worthMult(state, i));
    const g = goldenPct(state, i);
    moneyPerSec += eggsPerSec * (base * (1 - g) + base * GOLDEN_VALUE_MULT * g) * collValueMult(state);
    feathersPerSec += eggsPerSec * (featherPerEgg(state, i) * (1 - g) + featherGolden(state, i) * g);
  }
  return {
    money: Math.floor(moneyPerSec * seconds),
    feathers: Math.floor(feathersPerSec * seconds),
    seconds,
  };
}

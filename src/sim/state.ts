import { STATIONS } from "../config/kitchen";
import { TRUCK_START_X } from "../config/constants";
import { addBasket } from "./baskets";
import { computeLayout } from "./layout";
import type { SimHooks, SimState } from "./types";

export const DEFAULT_HOOKS: SimHooks = { rng: Math.random };

export interface CreateSimOptions {
  /** Game-area size in css px. Hosts call resize() once the canvas settles. */
  width?: number;
  height?: number;
}

/**
 * Fresh game exactly as the prototype boots: $0, 0 feathers, 2 chickens,
 * chicken node owned, one basket, no collectors.
 */
export function createSim(opts: CreateSimOptions = {}): SimState {
  const state: SimState = {
    money: 0,
    feathers: 0,
    totalDelivered: 0,
    counts: [2, 0, 0, 0, 0],
    layAcc: [0, 0, 0, 0, 0],
    n: { sp0: 1 },
    won: false,
    layout: computeLayout(opts.width ?? 390, opts.height ?? 700),
    falling: [],
    ground: [],
    flying: [],
    nextEggId: 1,
    baskets: [],
    collectors: [],
    fullWarnCd: 0,
    comboT: 999,
    comboN: 0,
    rush: { active: 0, next: 0 },
    kitchen: {
      pantry: [],
      chefs: STATIONS.map(() => 0),
      cooking: [],
      counter: [],
      truck: { truckState: "idle", truckX: TRUCK_START_X, truckPause: 0, sched: 0 },
      orders: [],
      nextOrderIn: 0,
      orderSeq: 1,
    },
    events: [],
  };
  addBasket(state);
  return state;
}

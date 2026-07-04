// Skill tree logic: reveal states, affordability, purchases and their side
// effects (species unlocks, extra baskets, hires), and the win condition.

import { NODES, nodeById, type NodeDef } from "../config/nodes";
import { addBasket } from "./baskets";
import { addCollector } from "./collectors";
import { birdCost, lvl, unlocked } from "./economy";
import { emit } from "./events";
import type { SimState } from "./types";

export type NodeVisualState = "hidden" | "new" | "part" | "max";

export const nodeCost = (s: SimState, n: NodeDef): number => n.cost(lvl(s, n.id));

export const canAfford = (s: SimState, n: NodeDef): boolean =>
  n.cur === "money" ? s.money >= nodeCost(s, n) : s.feathers >= nodeCost(s, n);

/** Progressive reveal: hidden until the parent has ≥1 level. */
export function nodeState(s: SimState, n: NodeDef): NodeVisualState {
  if (n.par && lvl(s, n.par) < 1) return "hidden";
  const l = lvl(s, n.id);
  if (l >= n.max) return "max";
  if (l > 0) return "part";
  return "new";
}

/** Win condition: every node at max level. */
export const treeComplete = (s: SimState): boolean =>
  NODES.every((n) => lvl(s, n.id) >= n.max);

/**
 * Buy one level of a node. Returns false (and changes nothing) if the node is
 * unknown, still hidden, already maxed, or unaffordable. The hidden check is
 * unreachable from the UI — it only guards direct API misuse.
 */
export function buyNode(state: SimState, id: string): boolean {
  const n = nodeById[id];
  if (!n) return false;
  if (nodeState(state, n) === "hidden") return false;
  const l = lvl(state, id);
  if (l >= n.max || !canAfford(state, n)) return false;
  const cost = n.cost(l);
  if (n.cur === "money") state.money -= cost;
  else state.feathers -= cost;
  state.n[id] = l + 1;
  if (id.startsWith("sp")) {
    const i = Number(id.slice(2));
    state.counts[i] = Math.max(state.counts[i], 1);
    emit(state, { type: "species-unlocked", species: i });
  } else {
    emit(state, { type: "node-bought", id, level: l + 1 });
  }
  if (id === "bextra") addBasket(state);
  if (id === "hire") addCollector(state);
  if (!state.won && treeComplete(state)) {
    state.won = true;
    emit(state, { type: "won" });
  }
  return true;
}

/**
 * Buy one bird of an unlocked species (shop strip, or a maxed species node
 * acting as the bird shop).
 */
export function buyBird(state: SimState, species: number): boolean {
  if (!unlocked(state, species)) return false;
  const c = birdCost(state, species);
  if (state.money < c) return false;
  state.money -= c;
  state.counts[species]++;
  emit(state, { type: "bird-bought", species, count: state.counts[species] });
  return true;
}

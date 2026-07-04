// Extracted verbatim from prototype/egg-empire.html — the full skill tree.
// Reveal rule: a node is hidden until its parent has level >= 1.
// Win condition: every node at max level.

import { SPECIES } from "./species";

export type Currency = "money" | "feathers";

export interface NodeDef {
  id: string;
  nm: string;
  col: number;          // grid column (0-3), x = COLS[col]
  row: number;          // grid row, y = TREE_TOP + row * ROW_H
  max: number;
  par: string | null;   // parent node id
  cur: Currency;
  cost: (lvl: number) => number;
  dsc: string;
  route?: "left";       // edge routed via the left margin (avoids crossing nodes)
}

const sp = (i: number, tier: number): NodeDef[] => [
  { id: `sp${i}`, nm: SPECIES[i].plural, col: 0, row: i, max: 1, par: i === 0 ? null : `sp${i - 1}`, cur: "money",
    cost: () => SPECIES[i].unlock, dsc: `Unlock ${SPECIES[i].plural.toLowerCase()}.` },
  { id: `w${i}`, nm: "Egg worth", col: 1, row: i, max: 5, par: `sp${i}`, cur: "feathers",
    cost: l => Math.ceil(8 * tier * Math.pow(2.1, l)), dsc: "Eggs sell for +25% per level." },
  { id: `s${i}`, nm: "Lay speed", col: 2, row: i, max: 5, par: `w${i}`, cur: "feathers",
    cost: l => Math.ceil(12 * tier * Math.pow(2.2, l)), dsc: "Lays 10% faster per level." },
  { id: `g${i}`, nm: "Golden egg", col: 3, row: i, max: 5, par: `s${i}`, cur: "feathers",
    cost: l => Math.ceil(15 * tier * Math.pow(2.4, l)), dsc: "+2% golden egg chance per level." },
];

const BASKET_COSTS = [15000, 400000, 10000000];

export const NODES: NodeDef[] = [
  ...sp(0, 1), ...sp(1, 2), ...sp(2, 3), ...sp(3, 4), ...sp(4, 5),

  { id: "bsize",  nm: "Bigger baskets",  col: 0, row: 5, max: 5, par: "sp1",   cur: "feathers", route: "left",
    cost: l => Math.ceil(25 * Math.pow(2.5, l)), dsc: "Every basket holds +6 more eggs per level." },
  { id: "bextra", nm: "Extra basket",    col: 1, row: 5, max: 3, par: "bsize", cur: "money",
    cost: l => BASKET_COSTS[l], dsc: "Adds a basket with its own truck." },
  { id: "tspd",   nm: "Truck speed",     col: 2, row: 5, max: 5, par: "bextra", cur: "feathers",
    cost: l => Math.ceil(30 * Math.pow(2.2, l)), dsc: "Trucks drive and load 30% faster per level." },
  { id: "ttime",  nm: "Truck schedule",  col: 3, row: 5, max: 5, par: "tspd",  cur: "feathers",
    cost: l => Math.ceil(35 * Math.pow(2.3, l)), dsc: "Trucks collect part-full baskets on a countdown (30s → 10s)." },
  { id: "coll",   nm: "Collectors",      col: 0, row: 6, max: 1, par: "bsize", cur: "feathers",
    cost: () => 150, dsc: "Unlock farmhands who gather eggs for you." },
  { id: "hire",   nm: "Hire collector",  col: 1, row: 6, max: 5, par: "coll",  cur: "money",
    cost: l => Math.floor(5000 * Math.pow(4, l)), dsc: "Adds a collector to the crew." },
  { id: "cspd",   nm: "Collector speed", col: 2, row: 6, max: 5, par: "hire",  cur: "feathers",
    cost: l => Math.ceil(40 * Math.pow(2.3, l)), dsc: "Collectors move 25% faster per level." },
  { id: "cbag",   nm: "Bigger bag",      col: 3, row: 6, max: 5, par: "cspd",  cur: "feathers",
    cost: l => Math.ceil(45 * Math.pow(2.3, l)), dsc: "Collectors carry +1 egg per trip per level." },
  { id: "cval",   nm: "Gentle hands",    col: 3, row: 7, max: 5, par: "cbag",  cur: "feathers",
    cost: l => Math.ceil(55 * Math.pow(2.4, l)), dsc: "Collector-gathered eggs are worth +10% per level." },
  { id: "fth",    nm: "Feathered eggs",  col: 2, row: 7, max: 5, par: "cval",  cur: "feathers",
    cost: l => Math.ceil(60 * Math.pow(2.4, l)), dsc: "+1 feather per egg and +10 per golden, per level." },
];

export const nodeById: Record<string, NodeDef> =
  Object.fromEntries(NODES.map(n => [n.id, n]));

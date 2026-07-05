// The full skill tree — PLAN.md Phase 3 sprawl. A central species spine runs
// top-to-bottom; each species fans its worth/speed/golden branch to one side;
// the farm cluster hangs off Ducks to the opposite side with the collector
// chain snaking below it; filler/support nodes sit between the big unlocks.
// Layout sanity (min node spacing, edges clearing nodes) is enforced by
// src/config/nodes.test.ts — reposition freely, the test has your back.
// Reveal rule: a node is hidden until its parent has level >= 1.
// Win condition: every node at max level (Phase 3 nodes included).

import {
  BASKET_COSTS,
  costTierMult,
  FARM_NODE_COSTS,
  HIRE_COSTS,
  SPECIES_NODE_COSTS,
} from "./economy";
import { CASINO_UNLOCK_COST } from "./casino";
import { KITCHEN_UNLOCK_COST, STATION_COSTS, STATIONS } from "./kitchen";
import { SPECIES } from "./species";

export type Currency = "money" | "feathers";
export type EdgeStyle = "elbow" | "straight";

export interface NodeDef {
  id: string;
  nm: string;
  x: number;            // design-space px (tree pans/zooms freely)
  y: number;
  max: number;
  par: string | null;   // parent node id
  cur: Currency;
  cost: (lvl: number) => number;
  dsc: string;
  edge?: EdgeStyle;     // default "elbow"
}

const speciesCost = (kind: keyof typeof SPECIES_NODE_COSTS, tier: number) => {
  const { base, growth } = SPECIES_NODE_COSTS[kind];
  return (l: number) => Math.ceil(base * costTierMult(tier) * Math.pow(growth, l));
};

const farmCost = (kind: keyof typeof FARM_NODE_COSTS) => {
  const { base, growth } = FARM_NODE_COSTS[kind];
  return (l: number) => Math.ceil(base * Math.pow(growth, l));
};

/** One species hub + its upgrade fan. side=+1 fans right, −1 left. */
const sp = (i: number, tier: number, y: number, side: 1 | -1): NodeDef[] => [
  { id: `sp${i}`, nm: SPECIES[i].plural, x: 0, y, max: 1, par: i === 0 ? null : `sp${i - 1}`, cur: "money", edge: "straight",
    cost: () => SPECIES[i].unlock, dsc: `Unlock ${SPECIES[i].plural.toLowerCase()}.` },
  { id: `w${i}`, nm: "Egg worth", x: 100 * side, y, max: 5, par: `sp${i}`, cur: "feathers",
    cost: speciesCost("w", tier), dsc: "Eggs sell for +50% per level." },
  { id: `s${i}`, nm: "Lay speed", x: 200 * side, y, max: 5, par: `w${i}`, cur: "feathers",
    cost: speciesCost("s", tier), dsc: "Lays 10% faster per level." },
  { id: `g${i}`, nm: "Golden egg", x: 300 * side, y, max: 5, par: `s${i}`, cur: "feathers",
    cost: speciesCost("g", tier), dsc: "+2% golden egg chance per level." },
];

export const NODES: NodeDef[] = [
  // Species spine — fans alternate sides; every block sits on a 100px grid
  // with straight radial edges so nothing ever crosses (nodes.test.ts
  // enforces spacing, edge clearance AND edge-edge crossings).
  ...sp(0, 1, 0, 1),
  ...sp(1, 2, 150, -1),
  ...sp(2, 3, 600, -1),
  ...sp(3, 4, 930, -1),
  ...sp(4, 5, 1120, 1),

  // FARM block — a tidy grid on Ducks' right flank.
  { id: "bsize",  nm: "Bigger baskets",  x: 110, y: 240, max: 5, par: "sp1",   cur: "feathers", edge: "straight",
    cost: farmCost("bsize"), dsc: "Every basket holds +8 more eggs per level." },
  { id: "bextra", nm: "Extra basket",    x: 210, y: 240, max: 3, par: "bsize", cur: "money",
    cost: l => BASKET_COSTS[l], dsc: "Adds a basket with its own truck." },
  { id: "tspd",   nm: "Truck speed",     x: 310, y: 240, max: 5, par: "bextra", cur: "feathers",
    cost: farmCost("tspd"), dsc: "Trucks drive and load 30% faster per level." },
  { id: "ttime",  nm: "Truck schedule",  x: 310, y: 340, max: 5, par: "tspd",  cur: "feathers", edge: "straight",
    cost: farmCost("ttime"), dsc: "Trucks collect part-full baskets on a countdown (30s → 10s)." },
  { id: "guard",  nm: "Night guard",     x: 310, y: 440, max: 3, par: "ttime", cur: "feathers", edge: "straight",
    cost: farmCost("guard"), dsc: "A watchman holds the line below the roost, shooing the fox that crosses it (bounty still pays you) — then recharges. More levels: faster watch." },
  { id: "ecap",   nm: "Roomier hay",     x: 110, y: 340, max: 4, par: "bsize", cur: "feathers", edge: "straight",
    cost: farmCost("ecap"), dsc: "+25 eggs can wait on the hay per level." },
  { id: "espoil", nm: "Fresh eggs",      x: 110, y: 440, max: 4, par: "ecap",  cur: "feathers", edge: "straight",
    cost: farmCost("espoil"), dsc: "Eggs stay fresh +5s per level." },
  { id: "coll",   nm: "Collectors",      x: 210, y: 340, max: 1, par: "bsize", cur: "feathers", edge: "straight",
    cost: farmCost("coll"), dsc: "Unlock farmhands who gather eggs for you." },
  { id: "hire",   nm: "Hire collector",  x: 210, y: 440, max: 5, par: "coll",  cur: "money", edge: "straight",
    cost: l => HIRE_COSTS[l], dsc: "Adds a collector to the crew." },
  { id: "cspd",   nm: "Collector speed", x: 210, y: 540, max: 5, par: "hire",  cur: "feathers", edge: "straight",
    cost: farmCost("cspd"), dsc: "Collectors move 25% faster per level." },
  { id: "cbag",   nm: "Bigger bag",      x: 310, y: 540, max: 5, par: "cspd",  cur: "feathers",
    cost: farmCost("cbag"), dsc: "Collectors carry +1 egg per trip per level." },
  { id: "cval",   nm: "Gentle hands",    x: 310, y: 640, max: 5, par: "cbag",  cur: "feathers", edge: "straight",
    cost: farmCost("cval"), dsc: "Collector-gathered eggs are worth +10% per level." },
  { id: "fth",    nm: "Feathered eggs",  x: 210, y: 640, max: 5, par: "cval",  cur: "feathers",
    cost: farmCost("fth"), dsc: "All feather income ×2 at level 1, up to ×6 at max." },

  // KITCHEN block — a 4×3 grid on Ducks' left flank.
  { id: "kitchen", nm: "The Kitchen",       x: -110, y: 240, max: 1, par: "sp1",     cur: "money", edge: "straight",
    cost: () => KITCHEN_UNLOCK_COST, dsc: "Unlock the kitchen: route eggs to chefs and sell dishes." },
  { id: "st_boil", nm: "Boiled station",    x: -210, y: 240, max: 1, par: "kitchen", cur: "money",
    cost: () => STATION_COSTS[0], dsc: `Unlock ${STATIONS[0].name}: 1 egg, ×${STATIONS[0].valueMult}.` },
  { id: "ckspd",   nm: "Faster pans",       x: -310, y: 240, max: 5, par: "st_boil", cur: "feathers",
    cost: farmCost("ckspd"), dsc: "Chefs cook 10% faster per level." },
  { id: "krush",   nm: "Dinner rush",       x: -410, y: 240, max: 3, par: "ckspd",   cur: "feathers",
    cost: farmCost("krush"), dsc: "A VIP guest drops by now and then — greet them and the kitchen goes wild: pans cook ×2, customers pour in. +4s per level." },
  { id: "pantry",  nm: "Bigger pantry",     x: -110, y: 340, max: 5, par: "kitchen", cur: "feathers", edge: "straight",
    cost: farmCost("pantry"), dsc: "The pantry holds +30 more eggs per level." },
  { id: "st_fry",  nm: "Fried station",     x: -210, y: 340, max: 1, par: "st_boil", cur: "money", edge: "straight",
    cost: () => STATION_COSTS[1], dsc: `Unlock ${STATIONS[1].name}: 1 egg, ×${STATIONS[1].valueMult}.` },
  { id: "st_scr",  nm: "Scrambled station", x: -310, y: 340, max: 1, par: "st_fry",  cur: "money",
    cost: () => STATION_COSTS[2], dsc: `Unlock ${STATIONS[2].name}: 2 eggs, ×${STATIONS[2].valueMult}.` },
  { id: "chefs2",  nm: "Sous chefs",        x: -410, y: 340, max: 2, par: "st_scr",  cur: "feathers",
    cost: farmCost("chefs2"), dsc: "+1 chef slot at every station per level." },
  { id: "counter", nm: "Long counter",      x: -110, y: 440, max: 3, par: "pantry",  cur: "feathers", edge: "straight",
    cost: farmCost("counter"), dsc: "Counter and delivery shelf each hold +20 more dishes per level." },
  { id: "ckval",   nm: "Secret seasoning",  x: -210, y: 440, max: 5, par: "st_fry",  cur: "feathers", edge: "straight",
    cost: farmCost("ckval"), dsc: "Dishes are worth +10% per level." },
  { id: "st_poa",  nm: "Poached station",   x: -310, y: 440, max: 1, par: "st_scr",  cur: "money", edge: "straight",
    cost: () => STATION_COSTS[3], dsc: `Unlock ${STATIONS[3].name}: 1 egg, ×${STATIONS[3].valueMult}.` },
  { id: "st_oml",  nm: "Omelette station",  x: -410, y: 440, max: 1, par: "st_poa",  cur: "money",
    cost: () => STATION_COSTS[4], dsc: `Unlock ${STATIONS[4].name}: 3 eggs, ×${STATIONS[4].valueMult}.` },

  // ACTIVE-PLAY row below Quail (left) + Midas filler off its golden branch.
  { id: "sweep",  nm: "Wider sweep",     x: -100, y: 700, max: 3, par: "sp2",   cur: "feathers", edge: "straight",
    cost: farmCost("sweep"), dsc: "Your swipe reaches +8px further per level." },
  { id: "combo",  nm: "Hot streak",      x: -200, y: 700, max: 3, par: "sweep", cur: "feathers",
    cost: farmCost("combo"), dsc: "Streak-swiped eggs are worth +5% per level." },
  { id: "rush",   nm: "Golden rush",     x: -300, y: 700, max: 3, par: "combo", cur: "feathers",
    cost: farmCost("rush"), dsc: "A shimmer egg lands now and then — sweep it and every bird lays ×5, streaks pay double. +4s per level." },
  { id: "gold2",  nm: "Midas flock",     x: -400, y: 700, max: 1, par: "g2",    cur: "feathers", edge: "straight",
    cost: farmCost("gold2"), dsc: "Swept golden eggs drop a bonus feather instantly." },

  // CASINO block below Quail (right).
  { id: "casino",  nm: "Bird Casino",    x: 100, y: 700, max: 1, par: "sp2",    cur: "money", edge: "straight",
    cost: () => CASINO_UNLOCK_COST, dsc: "Unlock the casino: drop eggs down the pachinko board into multiplier baskets." },
  { id: "pval",    nm: "Loaded baskets", x: 100, y: 800, max: 3, par: "casino", cur: "feathers", edge: "straight",
    cost: farmCost("pval"), dsc: "Every pachinko basket multiplier is +20% richer per level." },
  { id: "pbounce", nm: "Bouncy pins",    x: 200, y: 800, max: 3, par: "pval",   cur: "feathers",
    cost: farmCost("pbounce"), dsc: "Adds springy BLUE pins to the board — eggs rocket off them for extra value." },
  { id: "pdup",    nm: "Double yolk",    x: 300, y: 800, max: 3, par: "pbounce", cur: "feathers",
    cost: farmCost("pdup"), dsc: "Adds PINK twin-pins — an egg that hits one can split in two, both halves paying." },
  { id: "pauto",   nm: "Roost dropper",  x: 100, y: 900, max: 3, par: "pval",   cur: "feathers", edge: "straight",
    cost: farmCost("pauto"), dsc: "A hen roosts on the machine and drops eggs herself — faster per level." },

  // Flock economics off Geese.
  { id: "birdlot", nm: "Bulk deals",     x: 110, y: 1010, max: 3, par: "sp3",   cur: "feathers", edge: "straight",
    cost: farmCost("birdlot"), dsc: "Bird cost growth −0.02 per level, all species." },
];

export const nodeById: Record<string, NodeDef> =
  Object.fromEntries(NODES.map(n => [n.id, n]));

// --- edge geometry (single source for the tree renderer AND layout tests) ---
export const EDGE_TRIM = 26;

/** Polyline (design space) for the edge parent→child, trimmed off the nodes. */
export function edgePath(child: NodeDef): { x: number; y: number }[] {
  const p = nodeById[child.par!];
  if (child.edge === "straight") {
    const dx = child.x - p.x;
    const dy = child.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return [
      { x: p.x + (dx / d) * EDGE_TRIM, y: p.y + (dy / d) * EDGE_TRIM },
      { x: child.x - (dx / d) * EDGE_TRIM, y: child.y - (dy / d) * EDGE_TRIM },
    ];
  }
  if (p.y === child.y) {
    const dir = child.x > p.x ? 1 : -1;
    return [
      { x: p.x + EDGE_TRIM * dir, y: p.y },
      { x: child.x - EDGE_TRIM * dir, y: child.y },
    ];
  }
  const midY = (p.y + child.y) / 2;
  return [
    { x: p.x, y: p.y + Math.sign(child.y - p.y) * EDGE_TRIM },
    { x: p.x, y: midY },
    { x: child.x, y: midY },
    { x: child.x, y: child.y - Math.sign(child.y - p.y) * EDGE_TRIM },
  ];
}

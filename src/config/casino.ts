// The Bird Casino (Lily's design, 2026-07-05) — pachinko first. Drop an egg
// (priced at one best-species egg), it rattles down the pin board gaining a
// little value per bounce, and lands in a multiplier basket. Upgrades turn
// a house-edge toy into a late-game engine: bouncier pins (more hits),
// double-yolk splits (more balls), loaded baskets (bigger multipliers) and
// the roost dropper (a hen up top feeding the machine).

export const CASINO_UNLOCK_COST = 12_000_000; // money gate node (quail-era spike)

// Board in design px — the sim owns ball physics (headless under vitest);
// the render just draws this space 1:1 like the farm field.
export const BOARD_W = 340;
export const BOARD_H = 420;
export const PIN_ROWS = 5;
export const PIN_COLS = 7;
export const PIN_TOP = 90; //     y of the first pin row
export const PIN_GAP_Y = 56;
export const PIN_R = 5;
export const BALL_R = 8;
export const GRAVITY = 620;
export const RESTITUTION = 0.55; //   base bounciness off a pin
export const PBOUNCE_PER_LVL = 0.1; // Bouncy pins: restitution per level
export const HIT_MULT = 1.02; //      value gained per pin hit
export const MAX_BALLS = 24; //       in-flight cap (render pool = this)

export const BIN_MULTS = [5, 1, 0.2, 0.2, 1, 5]; // edge baskets pay, centre eats
export const PVAL_PER_LVL = 0.2; //   Loaded baskets: every multiplier +20%/lvl

export const DROP_COST_EGGS = 1; //   drops cost this many best-species eggs
export const PDUP_PCT_PER_LVL = 0.05; // Double yolk: split chance per pin hit
export const MAX_SPLITS = 2; //       per original drop

export const AUTO_DROP_INTERVAL = [0, 8, 5, 3]; // Roost dropper cadence by level
export const AUTO_MIN_BANKROLL = 20; // auto pauses under this many drop-costs
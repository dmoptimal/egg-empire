// Pachinko sim (the Bird Casino) — headless ball physics over plain state.
// Fixed substeps inside updateCasino keep fast balls from tunnelling pins
// whatever dt the render hands us. The render maps egg sprites onto
// state.casino.balls and draws the same design-space board.

import {
  AUTO_DROP_INTERVAL,
  AUTO_MIN_BANKROLL,
  BALL_R,
  BIN_MULTS,
  BOARD_H,
  BOARD_W,
  BOUNCY_BOOST,
  BOUNCY_PER_LVL,
  BOUNCY_PINS,
  BOUNCY_VALUE_MULT,
  DROP_COST_EGGS,
  GRAVITY,
  HIT_MULT,
  MAX_BALLS,
  MAX_SPLITS,
  PIN_COLS,
  PIN_GAP_Y,
  PIN_R,
  PIN_ROWS,
  PIN_TOP,
  PVAL_PER_LVL,
  RESTITUTION,
  ROULETTE_MULTS,
  RWHEEL_SLICES,
  SLOT_PAY3,
  SLOT_REEL_STOPS,
  SLOT_STRIP,
  SLUCK_RESPIN_PER_LVL,
  SPAY_PER_LVL,
  SPIN_DECEL,
  SPIN_VEL_MIN,
  SPIN_VEL_VAR,
  SPLIT_PER_LVL,
  SPLIT_PIN_PCT,
  SPLIT_PINS,
} from "../config/casino";
import { GOLDEN_VALUE_MULT } from "../config/constants";
import { SPECIES } from "../config/species";
import { lvl, unlocked, worthMult } from "./economy";
import { emit } from "./events";
import { bump } from "./stats";
import type { CasinoBall, SimState } from "./types";

export const casinoUnlocked = (s: SimState): boolean => lvl(s, "casino") >= 1;

/** Pin centre for a row/col — odd rows shift half a step (galton board). */
export function pinAt(row: number, col: number): { x: number; y: number } {
  const gapX = BOARD_W / PIN_COLS;
  return {
    x: gapX * 0.5 + col * gapX + (row % 2 === 1 ? gapX * 0.5 : 0),
    y: PIN_TOP + row * PIN_GAP_Y,
  };
}

function bestSpecies(s: SimState): number {
  for (let i = SPECIES.length - 1; i >= 0; i--) if (unlocked(s, i) && s.counts[i] > 0) return i;
  return 0;
}

/** One drop costs one best-species egg at live pricing. */
export function dropCost(s: SimState): number {
  const i = bestSpecies(s);
  return Math.max(1, Math.round(SPECIES[i].eggValue * worthMult(s, i)) * DROP_COST_EGGS);
}

export const binMult = (s: SimState, bin: number): number =>
  BIN_MULTS[bin] * (1 + PVAL_PER_LVL * lvl(s, "pval"));

export type PinKind = "normal" | "bouncy" | "split";

/** What a given pin does — upgrades convert fixed pins so the board reads. */
export function pinKind(s: SimState, row: number, col: number): PinKind {
  const splits = SPLIT_PER_LVL * lvl(s, "pdup");
  for (let i = 0; i < splits && i < SPLIT_PINS.length; i++)
    if (SPLIT_PINS[i][0] === row && SPLIT_PINS[i][1] === col) return "split";
  const bouncies = BOUNCY_PER_LVL * lvl(s, "pbounce");
  for (let i = 0; i < bouncies && i < BOUNCY_PINS.length; i++)
    if (BOUNCY_PINS[i][0] === row && BOUNCY_PINS[i][1] === col) return "bouncy";
  return "normal";
}

/** Player (or the roost dropper) feeds one egg into the machine. */
export function dropBall(state: SimState, rng: () => number, auto = false): boolean {
  if (!casinoUnlocked(state)) return false;
  if (state.casino.balls.length >= MAX_BALLS) return false;
  const cost = dropCost(state);
  if (state.money < cost) return false;
  state.money -= cost;
  const species = bestSpecies(state);
  const golden = !auto && rng() < 0.02; // a rare golden drop, just for the shine
  const ball: CasinoBall = {
    id: state.casino.ballSeq++,
    x: BOARD_W / 2 + (rng() * 2 - 1) * 22,
    y: 18,
    vx: (rng() * 2 - 1) * 30,
    vy: 0,
    value: cost * (golden ? GOLDEN_VALUE_MULT : 1),
    species,
    golden,
    splits: 0,
  };
  state.casino.balls.push(ball);
  bump(state, "drops");
  emit(state, { type: "casino-drop", ball, auto });
  return true;
}

function bounce(
  state: SimState,
  ball: CasinoBall,
  px: number,
  py: number,
  rng: () => number,
  kind: PinKind,
): void {
  const dx = ball.x - px;
  const dy = ball.y - py;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  // push out of the pin, reflect, damp (blue pins spring much harder)
  ball.x = px + nx * (PIN_R + BALL_R + 0.5);
  ball.y = py + ny * (PIN_R + BALL_R + 0.5);
  const dot = ball.vx * nx + ball.vy * ny;
  const r = RESTITUTION + (kind === "bouncy" ? BOUNCY_BOOST : 0);
  ball.vx = (ball.vx - 2 * dot * nx) * r + (rng() * 2 - 1) * 26;
  ball.vy = (ball.vy - 2 * dot * ny) * r;
  // Anti-stuck: a dead-centre hit can pogo on one pin forever — kick it
  // sideways (deterministic by id so headless runs stay reproducible).
  if (Math.abs(ball.vx) < 12) ball.vx = (ball.id % 2 === 0 ? -1 : 1) * 14;
  ball.value = Math.round(ball.value * (kind === "bouncy" ? BOUNCY_VALUE_MULT : HIT_MULT));
  // Double yolk: PINK pins split the egg (children never split again)
  if (
    kind === "split" &&
    ball.splits < MAX_SPLITS &&
    state.casino.balls.length < MAX_BALLS &&
    rng() < SPLIT_PIN_PCT
  ) {
    ball.splits++;
    const child: CasinoBall = {
      ...ball,
      id: state.casino.ballSeq++,
      vx: -ball.vx + (rng() * 2 - 1) * 20,
      splits: MAX_SPLITS,
      value: ball.value,
    };
    state.casino.balls.push(child);
    emit(state, { type: "casino-split", ball: child });
  }
}

/**
 * Launch the wheel with `chips × dropCost` on the line. Rejected while it is
 * still turning or the stake can't be covered.
 */
export function spinRoulette(state: SimState, rng: () => number, chips: number): boolean {
  if (!casinoUnlocked(state)) return false;
  const r = state.casino.roulette;
  if (r.vel > 0) return false;
  const bet = dropCost(state) * Math.max(1, Math.round(chips));
  if (state.money < bet) return false;
  state.money -= bet;
  r.bet = bet;
  r.vel = SPIN_VEL_MIN + rng() * SPIN_VEL_VAR;
  bump(state, "spins");
  emit(state, { type: "roulette-spun", bet });
  return true;
}

/** The slice currently under the top pointer. */
export function rouletteSlice(angle: number): number {
  const step = (Math.PI * 2) / ROULETTE_MULTS.length;
  const a = ((Math.PI * 2 - (angle % (Math.PI * 2))) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(ROULETTE_MULTS.length - 1, Math.floor(a / step));
}

/** A slice's live multiplier — Loaded wheel converts house slices to ×1. */
export function rouletteMult(s: SimState, slice: number): number {
  if (ROULETTE_MULTS[slice] > 0) return ROULETTE_MULTS[slice];
  const lv = lvl(s, "rwheel");
  for (let i = 0; i < lv && i < RWHEEL_SLICES.length; i++)
    if (RWHEEL_SLICES[i] === slice) return 1;
  return 0;
}

export const slotPayMult = (s: SimState): number => 1 + SPAY_PER_LVL * lvl(s, "spay");

const drawReels = (rng: () => number): number[] =>
  [0, 1, 2].map(() => SLOT_STRIP[Math.min(SLOT_STRIP.length - 1, Math.floor(rng() * SLOT_STRIP.length))]);

/** Pull the arm: charge the stake, draw all three reels up front. */
export function spinSlots(state: SimState, rng: () => number, chips: number): boolean {
  if (!casinoUnlocked(state)) return false;
  const sl = state.casino.slots;
  if (sl.bet > 0) return false;
  const bet = dropCost(state) * Math.max(1, Math.round(chips));
  if (state.money < bet) return false;
  state.money -= bet;
  sl.bet = bet;
  sl.t = 0;
  sl.revealed = 0;
  sl.result = drawReels(rng);
  bump(state, "pulls");
  emit(state, { type: "slots-spun", bet });
  return true;
}

function updateSlots(state: SimState, dt: number, rng: () => number): void {
  const sl = state.casino.slots;
  if (sl.bet <= 0) return;
  sl.t += dt;
  while (sl.revealed < 3 && sl.t >= SLOT_REEL_STOPS[sl.revealed]) {
    emit(state, { type: "slots-reel", reel: sl.revealed, symbol: sl.result[sl.revealed] });
    sl.revealed++;
  }
  if (sl.revealed < 3) return;
  // settle: only a full triple pays (run 2 is a near-miss, run 1 a dud)
  const [a, b] = sl.result;
  const c = sl.result[2];
  const run = a === b ? (b === c ? 3 : 2) : 1;
  // Lucky reels: a losing pull can respin free — the stake stays live
  if (run < 3 && rng() < SLUCK_RESPIN_PER_LVL * lvl(state, "sluck")) {
    sl.t = 0;
    sl.revealed = 0;
    sl.result = drawReels(rng);
    emit(state, { type: "slots-respin" });
    return;
  }
  const mult = run === 3 ? SLOT_PAY3[a] * slotPayMult(state) : 0;
  const money = Math.round(sl.bet * mult);
  state.money += money;
  if (money > (state.stats.slotsBest ?? 0)) state.stats.slotsBest = money;
  emit(state, { type: "slots-stopped", symbols: [...sl.result], run, mult, money, bet: sl.bet });
  sl.bet = 0;
}

function updateRoulette(state: SimState, dt: number): void {
  const r = state.casino.roulette;
  if (r.vel <= 0) return;
  r.angle += r.vel * dt;
  r.vel -= SPIN_DECEL * dt;
  if (r.vel > 0) return;
  r.vel = 0;
  r.angle %= Math.PI * 2;
  const slice = rouletteSlice(r.angle);
  const mult = rouletteMult(state, slice);
  const money = Math.round(r.bet * mult);
  state.money += money;
  if (money > (state.stats.rouletteBest ?? 0)) state.stats.rouletteBest = money;
  emit(state, { type: "roulette-stopped", slice, mult, money, bet: r.bet });
  r.bet = 0;
}

export function updateCasino(state: SimState, dt: number, rng: () => number): void {
  if (!casinoUnlocked(state)) return;
  const c = state.casino;
  updateRoulette(state, dt);
  updateSlots(state, dt, rng);

  // Roost dropper: a hen feeds the machine, pausing on a thin bankroll so
  // an unlucky streak can never drain the farm while you sleep.
  const auto = lvl(state, "pauto");
  if (auto >= 1) {
    if (c.nextAuto <= 0) c.nextAuto = AUTO_DROP_INTERVAL[Math.min(auto, AUTO_DROP_INTERVAL.length - 1)];
    c.nextAuto -= dt;
    if (c.nextAuto <= 0) {
      if (state.money >= dropCost(state) * AUTO_MIN_BANKROLL) dropBall(state, rng, true);
      c.nextAuto = AUTO_DROP_INTERVAL[Math.min(auto, AUTO_DROP_INTERVAL.length - 1)];
    }
  }

  // fixed substeps so fast balls can't tunnel through pins
  let left = dt;
  while (left > 0) {
    const h = Math.min(left, 1 / 120);
    left -= h;
    for (let i = c.balls.length - 1; i >= 0; i--) {
      const b = c.balls[i];
      b.vy += GRAVITY * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      // walls
      if (b.x < BALL_R) {
        b.x = BALL_R;
        b.vx = Math.abs(b.vx) * 0.7;
      } else if (b.x > BOARD_W - BALL_R) {
        b.x = BOARD_W - BALL_R;
        b.vx = -Math.abs(b.vx) * 0.7;
      }
      // pins (check the two nearest rows only)
      const row = Math.round((b.y - PIN_TOP) / PIN_GAP_Y);
      for (let r = Math.max(0, row - 1); r <= Math.min(PIN_ROWS - 1, row); r++) {
        for (let col = 0; col < PIN_COLS; col++) {
          const p = pinAt(r, col);
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          if (dx * dx + dy * dy < (PIN_R + BALL_R) * (PIN_R + BALL_R))
            bounce(state, b, p.x, p.y, rng, pinKind(state, r, col));
        }
      }
      // bins
      if (b.y > BOARD_H) {
        const bin = Math.max(0, Math.min(BIN_MULTS.length - 1, Math.floor((b.x / BOARD_W) * BIN_MULTS.length)));
        const money = Math.round(b.value * binMult(state, bin));
        state.money += money;
        if (money > (state.stats.casinoBest ?? 0)) state.stats.casinoBest = money;
        c.balls.splice(i, 1);
        emit(state, { type: "casino-payout", ball: b, bin, money });
      }
    }
  }
}

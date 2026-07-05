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
  SPLIT_PER_LVL,
  SPLIT_PIN_PCT,
  SPLIT_PINS,
} from "../config/casino";
import { GOLDEN_VALUE_MULT } from "../config/constants";
import { SPECIES } from "../config/species";
import { lvl, unlocked, worthMult } from "./economy";
import { emit } from "./events";
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

export function updateCasino(state: SimState, dt: number, rng: () => number): void {
  if (!casinoUnlocked(state)) return;
  const c = state.casino;

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
        c.balls.splice(i, 1);
        emit(state, { type: "casino-payout", ball: b, bin, money });
      }
    }
  }
}

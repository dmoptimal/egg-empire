// The Bird Casino screen (pachinko). Pure view over sim.casino: the board
// is the sim's design space drawn 1:1 (centred), balls are pooled egg
// sprites mapped by id, and the only inputs are the DROP button. Every
// decorative child opts out of hit-testing (the hard-won rule).

import { BitmapText, Container, Graphics, Sprite, Text } from "pixi.js";
import {
  BALL_R,
  BIN_MULTS,
  BOARD_H,
  BOARD_W,
  MAX_BALLS,
  PIN_COLS,
  PIN_R,
  PIN_ROWS,
  ROULETTE_BETS,
  ROULETTE_MULTS,
  WHEEL_R,
} from "../config/casino";
import { fmtMoney } from "../config/format";
import { binMult, dropCost, lvl, pinAt, pinKind, rouletteSlice, type SimState } from "../sim";
import { FONT, HOT_FONT, pixelButton, pixelPanel, type PixelButton } from "../ui/kit";
import type { Textures } from "./textures";

export interface CasinoView {
  layout(sim: SimState): void;
  refresh(sim: SimState): void;
  update(sim: SimState, now: number): void;
  /** Screen position of a payout basket — win popups spawn here. */
  binPos(bin: number): { x: number; y: number };
  /** Centre of the roulette wheel — spin results pop up here. */
  wheelPos(): { x: number; y: number };
}

export interface CasinoDeps {
  onDrop(): void;
  onSpin(chips: number): void;
  /** The wheel clacked past a slice divider (spin ratchet SFX). */
  onTick(): void;
}

export function createCasinoView(
  root: Container,
  textures: Textures,
  deps: CasinoDeps,
): CasinoView {
  const quiet = (c: Container): void => {
    c.eventMode = "none";
    c.interactiveChildren = false;
  };

  const bg = new Graphics();
  quiet(bg);
  root.addChild(bg);

  const title = new Text({
    text: "Bird Casino",
    style: { fontFamily: FONT, fontSize: 15, fontWeight: "700", fill: "#f2cf5d" },
  });
  title.anchor.set(0.5, 0);
  quiet(title);
  root.addChild(title);

  // cabinet tabs: Pachinko | Roulette
  let mode: "pachinko" | "roulette" = "pachinko";
  const tabLabel = (s: string): Text => {
    const t = new Text({ text: s, style: { fontFamily: FONT, fontSize: 13, fontWeight: "700", fill: "#fff" } });
    t.anchor.set(0.5);
    return t;
  };
  const tabPach = pixelButton({ w: 120, h: 30, face: 0x3a5a2f, content: tabLabel("Pachinko"), onTap: () => setMode("pachinko") });
  const tabRoul = pixelButton({ w: 120, h: 30, face: 0x3a5a2f, content: tabLabel("Roulette"), onTap: () => setMode("roulette") });
  root.addChild(tabPach.root, tabRoul.root);

  // the board: felt panel, pins, bin dividers — all in one static Graphics
  const board = new Container();
  quiet(board);
  root.addChild(board);
  const felt = new Graphics();
  pixelPanel(felt, -8, -8, BOARD_W + 16, BOARD_H + 46, { face: 0x1d3a2a, frame: 0x0d1a12 });
  board.addChild(felt);
  const pins = new Graphics();
  board.addChild(pins);
  let pinSig = "";
  // Special pins are visible board features: blue = springy, pink = splitter.
  const redrawPins = (sim: SimState): void => {
    const sig = `${lvl(sim, "pbounce")}|${lvl(sim, "pdup")}`;
    if (sig === pinSig) return;
    pinSig = sig;
    pins.clear();
    for (let r = 0; r < PIN_ROWS; r++)
      for (let c = 0; c < PIN_COLS; c++) {
        const p = pinAt(r, c);
        const kind = pinKind(sim, r, c);
        if (kind === "bouncy") {
          pins.circle(p.x, p.y, PIN_R + 2).fill(0x54a8ff);
          pins.circle(p.x, p.y, PIN_R - 1).fill(0x9fd2ff);
        } else if (kind === "split") {
          pins.circle(p.x, p.y, PIN_R + 2).fill(0xff6ad5);
          // a twin-yolk mark so it reads as "splitter"
          pins.circle(p.x - 2, p.y, 1.5).fill(0xfff0bd);
          pins.circle(p.x + 2, p.y, 1.5).fill(0xfff0bd);
        } else {
          pins.circle(p.x, p.y, PIN_R).fill(0xd8d8e0);
          pins.rect(p.x - 1, p.y - PIN_R, 2, 2).fill(0xffffff);
        }
      }
    // bin dividers + floor
    const binW = BOARD_W / BIN_MULTS.length;
    pins.rect(0, BOARD_H, BOARD_W, 4).fill(0x0d1a12);
    for (let b = 0; b <= BIN_MULTS.length; b++)
      pins.rect(b * binW - 1, BOARD_H - 34, 2, 34).fill(0x6a5a48);
  };
  const binW = BOARD_W / BIN_MULTS.length;
  const binLabels: BitmapText[] = [];
  for (let b = 0; b < BIN_MULTS.length; b++) {
    const t = new BitmapText({ text: "", style: { fontFamily: HOT_FONT, fontSize: 9 } });
    t.anchor.set(0.5);
    t.position.set(b * binW + binW / 2, BOARD_H - 16);
    board.addChild(t);
    binLabels.push(t);
  }

  // the roost dropper hen, once pauto is owned
  const hen = new Sprite(textures.bird[0]);
  hen.anchor.set(0.5, 1);
  hen.scale.set(2.4);
  hen.visible = false;
  board.addChild(hen);

  // pooled balls
  const balls: { sp: Sprite; id: number }[] = [];
  for (let i = 0; i < MAX_BALLS; i++) {
    const sp = new Sprite(textures.egg[0]);
    sp.anchor.set(0.5);
    sp.visible = false;
    board.addChild(sp);
    balls.push({ sp, id: -1 });
  }

  const dropLabel = new BitmapText({ text: "", style: { fontFamily: HOT_FONT, fontSize: 11 } });
  dropLabel.anchor.set(0.5);
  const drop: PixelButton = pixelButton({
    w: 190,
    h: 46,
    face: 0xb5892a,
    content: dropLabel,
    onTap: () => deps.onDrop(),
  });
  root.addChild(drop.root);

  // --- the roulette cabinet ---------------------------------------------------
  const wheelGroup = new Container();
  wheelGroup.visible = false;
  root.addChild(wheelGroup);
  const MULT_COLORS: Record<number, number> = { 8: 0xffd24a, 3: 0x8a5ab5, 2: 0x3aa8a0, 1: 0x2f9d5c };
  const rim = new Graphics();
  rim.circle(0, 0, WHEEL_R + 8).fill(0x0d1a12);
  quiet(rim);
  const wheelRot = new Container();
  quiet(wheelRot);
  const wheelGfx = new Graphics();
  const step = (Math.PI * 2) / ROULETTE_MULTS.length;
  for (let i = 0; i < ROULETTE_MULTS.length; i++) {
    const m = ROULETTE_MULTS[i];
    const a0 = -Math.PI / 2 + i * step;
    const color = m > 0 ? MULT_COLORS[m] ?? 0x3aa8a0 : i % 2 === 0 ? 0x1d3a2a : 0x16301f;
    wheelGfx.moveTo(0, 0).arc(0, 0, WHEEL_R, a0, a0 + step).lineTo(0, 0).fill(color);
  }
  wheelGfx.circle(0, 0, 26).fill(0x0d1a12);
  wheelGfx.circle(0, 0, 20).fill(0x24402c);
  wheelRot.addChild(wheelGfx);
  for (let i = 0; i < ROULETTE_MULTS.length; i++) {
    const m = ROULETTE_MULTS[i];
    if (m === 0) continue;
    const mid = -Math.PI / 2 + (i + 0.5) * step;
    const t = new BitmapText({ text: `×${m}`, style: { fontFamily: HOT_FONT, fontSize: 10 } });
    t.tint = m === 8 ? 0x241a2e : 0xfff3da;
    t.anchor.set(0.5);
    t.position.set(Math.cos(mid) * (WHEEL_R - 26), Math.sin(mid) * (WHEEL_R - 26));
    t.rotation = mid + Math.PI / 2;
    wheelRot.addChild(t);
  }
  const pointer = new Graphics();
  pointer.moveTo(-10, -WHEEL_R - 12).lineTo(10, -WHEEL_R - 12).lineTo(0, -WHEEL_R + 8).closePath().fill(0xffd24a);
  quiet(pointer);
  const wheelEgg = new Sprite(textures.egg[0]);
  wheelEgg.anchor.set(0.5);
  wheelEgg.scale.set(2.4);
  quiet(wheelEgg);
  wheelGroup.addChild(rim, wheelRot, pointer, wheelEgg);

  // stake chips + SPIN
  let chipSel = 0;
  const chipBtns: PixelButton[] = ROULETTE_BETS.map((mult, i) => {
    const label = new BitmapText({ text: `×${mult}`, style: { fontFamily: HOT_FONT, fontSize: 10 } });
    label.anchor.set(0.5);
    const b = pixelButton({
      w: 64,
      h: 34,
      face: 0x37476b,
      content: label,
      onTap: () => {
        chipSel = i;
        for (let c = 0; c < chipBtns.length; c++) chipBtns[c].root.alpha = c === chipSel ? 1 : 0.55;
        if (simRef) spinLabel.text = `SPIN  -${fmtMoney(dropCost(simRef) * ROULETTE_BETS[chipSel])}`;
      },
    });
    b.root.alpha = i === 0 ? 1 : 0.55;
    root.addChild(b.root);
    return b;
  });
  const spinLabel = new BitmapText({ text: "", style: { fontFamily: HOT_FONT, fontSize: 11 } });
  spinLabel.anchor.set(0.5);
  const spin: PixelButton = pixelButton({
    w: 190,
    h: 46,
    face: 0xb5892a,
    content: spinLabel,
    onTap: () => deps.onSpin(ROULETTE_BETS[chipSel]),
  });
  root.addChild(spin.root);
  let simRef: SimState | null = null;
  let lastSlice = -1;

  function setMode(next: "pachinko" | "roulette"): void {
    mode = next;
    board.visible = next === "pachinko";
    drop.root.visible = next === "pachinko";
    wheelGroup.visible = next === "roulette";
    spin.root.visible = next === "roulette";
    for (const c of chipBtns) c.root.visible = next === "roulette";
    tabPach.root.alpha = next === "pachinko" ? 1 : 0.55;
    tabRoul.root.alpha = next === "roulette" ? 1 : 0.55;
  }

  let ox = 20;
  let oy = 96;
  let wcx = 195;
  let wcy = 300;

  return {
    layout(sim: SimState): void {
      const { w: W, h: H } = sim.layout;
      bg.clear();
      bg.rect(0, 0, W, H).fill(0x241a2e); // plush casino dark
      for (let y = 22; y < H; y += 44)
        for (let x = ((y / 44) % 2) * 22; x < W; x += 44) bg.rect(x, y, 22, 22);
      bg.fill(0x2b2036);
      title.position.set(W / 2, 36);
      tabPach.root.position.set(Math.round(W / 2) - 124, 58);
      tabRoul.root.position.set(Math.round(W / 2) + 4, 58);
      ox = Math.round((W - BOARD_W) / 2);
      oy = 100;
      board.position.set(ox, oy);
      hen.position.set(BOARD_W / 2, 12);
      drop.root.position.set(Math.round(W / 2 - 95), Math.min(oy + BOARD_H + 52, H - 56));
      wcx = Math.round(W / 2);
      wcy = oy + WHEEL_R + 20;
      wheelGroup.position.set(wcx, wcy);
      const chipsX = Math.round(W / 2) - 106;
      chipBtns.forEach((c, i) => c.root.position.set(chipsX + i * 74, wcy + WHEEL_R + 26));
      spin.root.position.set(Math.round(W / 2 - 95), Math.min(wcy + WHEEL_R + 72, H - 56));
      setMode(mode);
    },
    refresh(sim: SimState): void {
      simRef = sim;
      redrawPins(sim);
      const cost = dropCost(sim);
      dropLabel.text = `DROP  -${fmtMoney(cost)}`;
      drop.setDisabled(sim.money < cost);
      spinLabel.text = `SPIN  -${fmtMoney(cost * ROULETTE_BETS[chipSel])}`;
      for (let b = 0; b < binLabels.length; b++) {
        const m = binMult(sim, b);
        binLabels[b].text = `×${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}`;
        binLabels[b].tint = m >= 2 ? 0xffd24a : m >= 1 ? 0x8fe3d0 : 0x9a8f80;
      }
      hen.visible = lvl(sim, "pauto") >= 1;
    },
    update(sim: SimState, now: number): void {
      // sync pooled sprites to sim balls by id (index loops, no allocation)
      for (let vi = 0; vi < balls.length; vi++) {
        const v = balls[vi];
        if (v.id === -1) continue;
        let alive = false;
        for (let bi = 0; bi < sim.casino.balls.length; bi++)
          if (sim.casino.balls[bi].id === v.id) {
            alive = true;
            break;
          }
        if (!alive) {
          v.id = -1;
          v.sp.visible = false;
        }
      }
      for (let bi = 0; bi < sim.casino.balls.length; bi++) {
        const b = sim.casino.balls[bi];
        let v: { sp: Sprite; id: number } | null = null;
        for (let vi = 0; vi < balls.length; vi++)
          if (balls[vi].id === b.id) {
            v = balls[vi];
            break;
          }
        if (!v) {
          for (let vi = 0; vi < balls.length; vi++)
            if (balls[vi].id === -1) {
              v = balls[vi];
              break;
            }
          if (!v) continue;
          v.id = b.id;
          v.sp.texture = b.golden ? textures.gold : textures.egg[b.species];
          v.sp.scale.set((BALL_R * 2) / 7);
          v.sp.visible = true;
        }
        v.sp.position.set(b.x, b.y);
        v.sp.rotation = (b.x + b.y) * 0.05;
      }
      hen.x = BOARD_W / 2 + Math.sin(now * 1.3) * 60;
      hen.scale.x = Math.cos(now * 1.3) > 0 ? 2.4 : -2.4;
      // the wheel — sim owns the angle, the egg orbits against the spin
      const r = sim.casino.roulette;
      wheelRot.rotation = r.angle;
      if (r.vel > 0) {
        const ea = -r.angle * 0.85 - Math.PI / 2;
        wheelEgg.position.set(Math.cos(ea) * (WHEEL_R - 16), Math.sin(ea) * (WHEEL_R - 16));
        wheelEgg.rotation += 0.4;
        const sl = rouletteSlice(r.angle);
        if (sl !== lastSlice) {
          lastSlice = sl;
          if (wheelGroup.visible) deps.onTick();
        }
      } else {
        wheelEgg.position.set(0, -WHEEL_R + 18);
        wheelEgg.rotation = 0;
      }
      spin.setDisabled(r.vel > 0 || sim.money < dropCost(sim) * ROULETTE_BETS[chipSel]);
    },
    binPos(bin: number): { x: number; y: number } {
      const binW2 = BOARD_W / BIN_MULTS.length;
      return { x: ox + bin * binW2 + binW2 / 2, y: oy + BOARD_H - 24 };
    },
    wheelPos(): { x: number; y: number } {
      return { x: wcx, y: wcy };
    },
  };
}

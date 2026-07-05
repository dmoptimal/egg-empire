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
} from "../config/casino";
import { fmtMoney } from "../config/format";
import { binMult, dropCost, lvl, pinAt, pinKind, type SimState } from "../sim";
import { FONT, HOT_FONT, pixelButton, pixelPanel, type PixelButton } from "../ui/kit";
import type { Textures } from "./textures";

export interface CasinoView {
  layout(sim: SimState): void;
  refresh(sim: SimState): void;
  update(sim: SimState, now: number): void;
  /** Screen position of a payout basket — win popups spawn here. */
  binPos(bin: number): { x: number; y: number };
}

export interface CasinoDeps {
  onDrop(): void;
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
    text: "Bird Casino — Pachinko",
    style: { fontFamily: FONT, fontSize: 15, fontWeight: "700", fill: "#f2cf5d" },
  });
  title.anchor.set(0.5, 0);
  quiet(title);
  root.addChild(title);

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

  let ox = 20;
  let oy = 96;

  return {
    layout(sim: SimState): void {
      const { w: W, h: H } = sim.layout;
      bg.clear();
      bg.rect(0, 0, W, H).fill(0x241a2e); // plush casino dark
      for (let y = 22; y < H; y += 44)
        for (let x = ((y / 44) % 2) * 22; x < W; x += 44) bg.rect(x, y, 22, 22);
      bg.fill(0x2b2036);
      title.position.set(W / 2, 52);
      ox = Math.round((W - BOARD_W) / 2);
      oy = 96;
      board.position.set(ox, oy);
      hen.position.set(BOARD_W / 2, 12);
      drop.root.position.set(Math.round(W / 2 - 95), Math.min(oy + BOARD_H + 52, H - 56));
    },
    refresh(sim: SimState): void {
      redrawPins(sim);
      const cost = dropCost(sim);
      dropLabel.text = `DROP  -${fmtMoney(cost)}`;
      drop.setDisabled(sim.money < cost);
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
    },
    binPos(bin: number): { x: number; y: number } {
      const binW2 = BOARD_W / BIN_MULTS.length;
      return { x: ox + bin * binW2 + binW2 / 2, y: oy + BOARD_H - 24 };
    },
  };
}

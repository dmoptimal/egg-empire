// HUD (PLAN.md Phase 1): money/feather chips, mute button, hint and toast —
// all in-canvas pixel panels with BitmapFont numbers. The bottom bar lives
// in ./bar.ts.

import { BitmapText, Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { toggleMute } from "../audio/sfx";
import { fmt, fmtMoney } from "../config/format";
import type { SimState } from "../sim";
import type { Textures } from "../render/textures";
import { attachTap, FONT, HOT_FONT, pixelPanel, safeInsets } from "./kit";

export interface Hud {
  refresh(): void;
  layout(): void;
  update(dt: number): void;
  showHint(): void;
  hideHint(): void;
  toast(msg: string): void;
}

export interface HudDeps {
  sim: SimState;
  layer: Container;
  textures: Textures;
}

const CHIP_H = 30;
const CHIP_PAD = 12;
const CHIP_GAP = 8;
const CHIP_FACE = 0x14201a;
const CHIP_FRAME = 0x060a08;

interface Chip {
  root: Container;
  gfx: Graphics;
  width: number;
}

export function createHud(deps: HudDeps): Hud {
  const { sim, layer, textures } = deps;

  const makeChip = (content: Container[], tappable?: () => void): Chip => {
    const root = new Container();
    const gfx = new Graphics();
    root.addChild(gfx, ...content);
    layer.addChild(root);
    const chip: Chip = { root, gfx, width: 0 };
    if (tappable) attachTap(root, { onTap: tappable });
    return chip;
  };

  const moneyText = new BitmapText({
    text: "$0",
    style: { fontFamily: HOT_FONT, fontSize: 13 },
  });
  moneyText.tint = 0xffd94a;
  const moneyChip = makeChip([moneyText]);

  const featherText = new BitmapText({
    text: "0",
    style: { fontFamily: HOT_FONT, fontSize: 13 },
  });
  featherText.tint = 0x8fe3d0;
  const featherGlyph = new Sprite(textures.icons.feather);
  featherGlyph.scale.set(2);
  const featherChip = makeChip([featherText, featherGlyph]);

  const muteIcon = new Sprite(textures.icons.speakerOn);
  muteIcon.scale.set(1.6);
  const muteChip = makeChip([muteIcon], () => {
    muteIcon.texture = toggleMute() ? textures.icons.speakerOff : textures.icons.speakerOn;
  });
  // 44px+ hit target without growing the visual chip.
  muteChip.root.hitArea = new Rectangle(-5, -8, 44, 46);

  const chips = [moneyChip, featherChip, muteChip];

  // hint --------------------------------------------------------------
  const hint = new Text({
    text: "Tap or swipe across the eggs to collect them!",
    style: {
      fontFamily: FONT,
      fontSize: 16,
      fontWeight: "700",
      fill: "#fff",
      stroke: { color: "#000", width: 4 },
      align: "center",
      wordWrap: true,
      wordWrapWidth: 320,
    },
  });
  hint.anchor.set(0.5);
  hint.alpha = 0;
  let hintTarget = 0;
  layer.addChild(hint);

  // combo meter — escalates Balatro-style as the streak climbs -----------
  const combo = new BitmapText({ text: "", style: { fontFamily: HOT_FONT, fontSize: 12 } });
  combo.anchor.set(0.5);
  combo.alpha = 0;
  layer.addChild(combo);
  let lastComboN = 0;
  let comboPop = 1;
  let comboTime = 0;

  // Golden Rush countdown -------------------------------------------------
  const rushText = new BitmapText({ text: "", style: { fontFamily: HOT_FONT, fontSize: 11 } });
  rushText.tint = 0xffd24a;
  rushText.anchor.set(0.5);
  rushText.visible = false;
  layer.addChild(rushText);

  // toast ---------------------------------------------------------------
  const toastRoot = new Container();
  const toastGfx = new Graphics();
  const toastText = new Text({
    text: "",
    style: { fontFamily: FONT, fontSize: 14, fontWeight: "700", fill: "#ffd94a" },
  });
  toastText.anchor.set(0.5);
  toastRoot.addChild(toastGfx, toastText);
  toastRoot.visible = false;
  let toastTimer = 0;
  layer.addChild(toastRoot);

  function layoutChips(): void {
    const W = sim.layout.w;
    const top = safeInsets().top + 6;
    // measure
    moneyChip.width = Math.ceil(moneyText.width) + CHIP_PAD * 2;
    featherChip.width = Math.ceil(featherText.width + 6 + featherGlyph.width) + CHIP_PAD * 2;
    muteChip.width = 34;
    const total = chips.reduce((a, c) => a + c.width, 0) + CHIP_GAP * (chips.length - 1);
    let x = Math.round((W - total) / 2);
    for (const c of chips) {
      c.gfx.clear();
      pixelPanel(c.gfx, 0, 0, c.width, CHIP_H, { face: CHIP_FACE, faceAlpha: 0.92, frame: CHIP_FRAME });
      c.root.position.set(x, top);
      x += c.width + CHIP_GAP;
    }
    moneyText.position.set(CHIP_PAD, Math.round((CHIP_H - moneyText.height) / 2));
    featherText.position.set(CHIP_PAD, Math.round((CHIP_H - featherText.height) / 2));
    featherGlyph.position.set(CHIP_PAD + featherText.width + 6, Math.round((CHIP_H - featherGlyph.height) / 2));
    muteIcon.position.set(
      Math.round((muteChip.width - muteIcon.width) / 2),
      Math.round((CHIP_H - muteIcon.height) / 2),
    );
    hint.position.set(W / 2, sim.layout.h * 0.42);
    hint.style.wordWrapWidth = W - 48;
    positionToast();
  }

  function positionToast(): void {
    const w = Math.ceil(toastText.width) + 28;
    const h = 34;
    toastGfx.clear();
    pixelPanel(toastGfx, 0, 0, w, h, { face: CHIP_FACE, faceAlpha: 0.92, frame: CHIP_FRAME });
    toastText.position.set(Math.round(w / 2), Math.round(h / 2));
    toastRoot.position.set(Math.round((sim.layout.w - w) / 2), safeInsets().top + 6 + CHIP_H + 8);
  }

  return {
    refresh(): void {
      moneyText.text = fmtMoney(sim.money);
      featherText.text = fmt(sim.feathers);
      layoutChips();
    },
    layout: layoutChips,
    update(dt: number): void {
      hint.alpha += (hintTarget - hint.alpha) * Math.min(1, dt * 5);
      if (toastTimer > 0) {
        toastTimer -= dt;
        toastRoot.alpha = Math.min(1, toastTimer * 2);
        if (toastTimer <= 0) toastRoot.visible = false;
      }
      // combo meter: bigger, hotter, shakier as the streak climbs
      comboTime += dt;
      const n = sim.comboN;
      if (n > lastComboN) comboPop = 1.5; // punch on every extra egg
      lastComboN = n;
      comboPop += (1 - comboPop) * Math.min(1, dt * 10);
      const show = n >= 3 && sim.comboT < 1.2;
      if (show) {
        combo.text = `×${n}`;
        combo.style.fontSize = 12 + Math.min(n, 40) * 0.6;
        combo.tint = n < 5 ? 0xffffff : n < 10 ? 0x8fe3d0 : n < 20 ? 0xffd24a : n < 30 ? 0xff9a3d : 0xff5a4a;
        combo.scale.set(comboPop);
        const shake = n > 15 ? Math.min(3, (n - 15) * 0.2) : 0;
        combo.position.set(
          Math.round(sim.layout.w / 2 + Math.sin(comboTime * 70) * shake),
          Math.round(safeInsets().top + 64 + Math.cos(comboTime * 63) * shake),
        );
        combo.alpha = sim.comboT < 0.45 ? 1 : 1 - (sim.comboT - 0.45) / 0.75;
      } else {
        combo.alpha = Math.max(0, combo.alpha - dt * 4);
      }
      // rush countdown
      if (sim.rush.active > 0) {
        rushText.visible = true;
        rushText.text = `RUSH ${Math.ceil(sim.rush.active)}s`;
        rushText.position.set(Math.round(sim.layout.w / 2), safeInsets().top + 44);
      } else {
        rushText.visible = false;
      }
    },
    showHint(): void {
      hintTarget = 1;
    },
    hideHint(): void {
      hintTarget = 0;
    },
    toast(msg: string): void {
      toastText.text = msg;
      toastRoot.visible = true;
      toastRoot.alpha = 1;
      toastTimer = 4.5;
      positionToast();
    },
  };
}

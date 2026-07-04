// HUD (PLAN.md Phase 1): money/feather chips, mute button, hint and toast —
// all in-canvas pixel panels with BitmapFont numbers. TRANSITIONAL: the
// bottom bar (shop strip + tree button) is still DOM and migrates in the
// next Phase 1 chunk; its refresh logic lives here until then.

import { BitmapText, Container, Graphics, Text } from "pixi.js";
import { audioInit, toggleMute } from "../audio/sfx";
import { fmt, fmtMoney } from "../config/format";
import { SPECIES } from "../config/species";
import { birdCost, unlocked, type SimState } from "../sim";
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
  onBuyBird(species: number): void;
  onToggleTree(): void;
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
  const { sim, layer } = deps;

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
    style: { fontFamily: HOT_FONT, fontSize: 16 },
  });
  moneyText.tint = 0xffd94a;
  const moneyChip = makeChip([moneyText]);

  const featherText = new BitmapText({
    text: "0",
    style: { fontFamily: HOT_FONT, fontSize: 16 },
  });
  featherText.tint = 0x8fe3d0;
  const featherGlyph = new Text({ text: "🪶", style: { fontSize: 14 } });
  const featherChip = makeChip([featherText, featherGlyph]);

  const muteText = new Text({ text: "🔊", style: { fontSize: 15 } });
  const muteChip = makeChip([muteText], () => {
    muteText.text = toggleMute() ? "🔇" : "🔊";
    layoutChips();
  });

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
    muteText.position.set(
      Math.round((muteChip.width - muteText.width) / 2),
      Math.round((CHIP_H - muteText.height) / 2),
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

  // transitional DOM shop (migrates in the next Phase 1 chunk) -----------
  const shopEl = document.getElementById("shop")!;
  const shopBtns = new Map<number, HTMLButtonElement>();
  document.getElementById("togglePanel")!.addEventListener("pointerdown", () => {
    audioInit();
    deps.onToggleTree();
  });

  function refreshShop(): void {
    for (let i = 0; i < SPECIES.length; i++) {
      if (!unlocked(sim, i)) continue;
      let b = shopBtns.get(i);
      if (!b) {
        b = document.createElement("button");
        const species = i;
        b.addEventListener("pointerdown", () => {
          audioInit();
          deps.onBuyBird(species);
        });
        shopEl.insertBefore(b, shopEl.firstChild); // newest species first
        shopBtns.set(i, b);
      }
      const c = birdCost(sim, i);
      b.innerHTML = `${SPECIES[i].name} <small>${fmtMoney(c)} · own ${sim.counts[i]}</small>`;
      b.disabled = sim.money < c;
    }
  }

  return {
    refresh(): void {
      moneyText.text = fmtMoney(sim.money);
      featherText.text = fmt(sim.feathers);
      layoutChips();
      refreshShop();
    },
    layout: layoutChips,
    update(dt: number): void {
      hint.alpha += (hintTarget - hint.alpha) * Math.min(1, dt * 5);
      if (toastTimer > 0) {
        toastTimer -= dt;
        toastRoot.alpha = Math.min(1, toastTimer * 2);
        if (toastTimer <= 0) toastRoot.visible = false;
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

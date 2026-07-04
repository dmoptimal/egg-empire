// Bottom bar (PLAN.md Phase 1): the shop strip and Skill tree button as
// in-canvas pixel buttons. The strip owns its gesture — horizontal drag
// scrolls (clamped), a tap under the drag threshold buys — so fast scrolls
// can never purchase. Newest unlocked species sits leftmost, like the
// prototype's insertBefore(firstChild).

import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from "pixi.js";
import { audioInit } from "../audio/sfx";
import { fmtMoney } from "../config/format";
import { SPECIES } from "../config/species";
import { birdCost, unlocked, type SimState } from "../sim";
import { FONT, pixelButton, pixelPanel } from "./kit";

/** Bar content height (excludes the safe-area inset below it). */
export const BAR_H = 70;
const BTN_H = 54;
const PAD = 8;
const GAP = 6;
const BTN_MIN_W = 100;
const SHOP_FACE = 0x2f6fdb;
const BAR_FACE = 0x20301a;
const FRAME = 0x101a24;

interface ShopBtn {
  species: number;
  root: Container;
  gfx: Graphics;
  name: Text;
  sub: Text;
  w: number;
  disabled: boolean;
  pressed: boolean;
}

export interface Bar {
  refresh(): void;
  layout(w: number, h: number, safeBottom: number): void;
}

export interface BarDeps {
  sim: SimState;
  layer: Container;
  onBuyBird(species: number): void;
  onToggleTree(): void;
}

const darken = (c: number, f: number): number => {
  const r = Math.floor(((c >> 16) & 0xff) * f);
  const g = Math.floor(((c >> 8) & 0xff) * f);
  const b = Math.floor((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
};

export function createBar(deps: BarDeps): Bar {
  const { sim, layer } = deps;
  const face = new Graphics();
  const strip = new Container();
  const stripMask = new Graphics();
  strip.mask = stripMask;
  const stripHit = new Graphics(); // transparent gesture surface over the strip
  layer.addChild(face, strip, stripMask, stripHit);

  const treeLabel = new Text({
    text: "Skill tree 🪶",
    style: { fontFamily: FONT, fontSize: 14, fontWeight: "700", fill: "#fff" },
  });
  treeLabel.anchor.set(0.5);
  const treeBtn = pixelButton({
    w: 112,
    h: BTN_H,
    face: SHOP_FACE,
    frame: FRAME,
    content: treeLabel,
    onTap: () => {
      audioInit();
      deps.onToggleTree();
    },
  });
  layer.addChild(treeBtn.root);

  const buttons: ShopBtn[] = [];
  let W = 390;
  let stripW = 200;
  let scrollX = 0;

  function drawBtn(b: ShopBtn): void {
    b.gfx.clear();
    const faceColor = b.disabled ? 0x4a4a4a : b.pressed ? darken(SHOP_FACE, 0.72) : SHOP_FACE;
    pixelPanel(b.gfx, 0, 0, b.w, BTN_H, { face: faceColor, frame: FRAME });
    const dy = b.pressed && !b.disabled ? 2 : 0;
    b.name.alpha = b.disabled ? 0.55 : 1;
    b.sub.alpha = b.disabled ? 0.55 : 0.9;
    b.name.position.set(Math.round(b.w / 2), 15 + dy);
    b.sub.position.set(Math.round(b.w / 2), 36 + dy);
  }

  function layoutStrip(): void {
    const contentW = buttons.reduce((a, b) => a + b.w, 0) + GAP * Math.max(0, buttons.length - 1);
    const minScroll = Math.min(0, stripW - contentW);
    scrollX = Math.max(minScroll, Math.min(0, scrollX));
    let x = 0;
    for (const b of buttons) {
      b.root.position.set(x, PAD);
      x += b.w + GAP;
    }
    strip.x = PAD + scrollX;
  }

  function buttonAt(globalX: number, globalY: number): ShopBtn | null {
    const localY = globalY - layer.y;
    if (localY < PAD || localY > PAD + BTN_H) return null;
    let x = globalX - PAD - scrollX;
    if (globalX > PAD + stripW) return null;
    for (const b of buttons) {
      if (x >= 0 && x <= b.w) return b;
      x -= b.w + GAP;
    }
    return null;
  }

  // --- strip gesture: drag scrolls, short tap buys -----------------------
  let activeId: number | null = null;
  let startX = 0;
  let startScroll = 0;
  let dragging = false;
  let pressed: ShopBtn | null = null;
  stripHit.eventMode = "static";
  stripHit.on("pointerdown", (ev: FederatedPointerEvent) => {
    ev.stopPropagation();
    audioInit();
    activeId = ev.pointerId;
    startX = ev.global.x;
    startScroll = scrollX;
    dragging = false;
    pressed = buttonAt(ev.global.x, ev.global.y);
    if (pressed && !pressed.disabled) {
      pressed.pressed = true;
      drawBtn(pressed);
    }
  });
  stripHit.on("globalpointermove", (ev: FederatedPointerEvent) => {
    if (ev.pointerId !== activeId) return;
    const dx = ev.global.x - startX;
    if (!dragging && Math.abs(dx) > 10) {
      dragging = true;
      if (pressed) {
        pressed.pressed = false;
        drawBtn(pressed);
      }
    }
    if (dragging) {
      scrollX = startScroll + dx;
      layoutStrip();
    }
  });
  const endStrip = (ev: FederatedPointerEvent, fire: boolean): void => {
    if (ev.pointerId !== activeId) return;
    ev.stopPropagation();
    activeId = null;
    if (pressed) {
      pressed.pressed = false;
      drawBtn(pressed);
      if (fire && !dragging && !pressed.disabled) deps.onBuyBird(pressed.species);
    }
    pressed = null;
  };
  stripHit.on("pointerup", (ev) => endStrip(ev, true));
  stripHit.on("pointerupoutside", (ev) => endStrip(ev, false));
  stripHit.on("pointercancel", (ev) => endStrip(ev, false));

  function ensureButtons(): void {
    for (let i = 0; i < SPECIES.length; i++) {
      if (!unlocked(sim, i)) continue;
      if (buttons.some((b) => b.species === i)) continue;
      const root = new Container();
      const gfx = new Graphics();
      const name = new Text({
        text: SPECIES[i].name,
        style: { fontFamily: FONT, fontSize: 14, fontWeight: "700", fill: "#fff" },
      });
      name.anchor.set(0.5);
      const sub = new Text({
        text: "",
        style: { fontFamily: FONT, fontSize: 11, fill: "#dce6f5" },
      });
      sub.anchor.set(0.5);
      root.addChild(gfx, name, sub);
      strip.addChild(root);
      buttons.unshift({ species: i, root, gfx, name, sub, w: BTN_MIN_W, disabled: true, pressed: false });
      scrollX = 0; // newest species scrolls into view at the left edge
    }
  }

  return {
    refresh(): void {
      ensureButtons();
      for (const b of buttons) {
        const c = birdCost(sim, b.species);
        b.sub.text = `${fmtMoney(c)} · own ${sim.counts[b.species]}`;
        b.w = Math.max(BTN_MIN_W, Math.ceil(Math.max(b.name.width, b.sub.width)) + 18);
        b.disabled = sim.money < c;
        drawBtn(b);
      }
      layoutStrip();
    },
    layout(w: number, h: number, safeBottom: number): void {
      W = w;
      layer.y = h - BAR_H - safeBottom;
      const treeW = Math.max(112, Math.round(W * 0.32));
      stripW = W - PAD * 3 - treeW;
      face.clear();
      face.rect(0, 0, W, BAR_H + safeBottom).fill(BAR_FACE);
      treeBtn.resize(treeW, BTN_H);
      treeBtn.root.position.set(W - PAD - treeW, PAD);
      stripMask.clear();
      stripMask.rect(PAD, PAD, stripW, BTN_H).fill(0xffffff);
      stripHit.clear();
      stripHit.rect(PAD, PAD, stripW, BTN_H).fill({ color: 0xffffff, alpha: 0.001 });
      stripHit.hitArea = new Rectangle(PAD, PAD, stripW, BTN_H);
      layoutStrip();
    },
  };
}

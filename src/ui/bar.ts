// Bottom bar (PLAN.md Phase 1): the shop strip and Skill tree button as
// in-canvas pixel buttons. The strip owns its gesture — horizontal drag
// scrolls (clamped), a tap under the drag threshold buys — so fast scrolls
// can never purchase. Newest unlocked species sits leftmost, like the
// prototype's insertBefore(firstChild).

import { Container, Graphics, Rectangle, Sprite, Text, type FederatedPointerEvent } from "pixi.js";
import { audioInit } from "../audio/sfx";
import { fmtMoney } from "../config/format";
import { SPECIES } from "../config/species";
import { birdCost, kitchenUnlocked, unlocked, type SimState } from "../sim";
import type { Textures } from "../render/textures";
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
  setScreen(screen: "farm" | "kitchen"): void;
}

export interface BarDeps {
  sim: SimState;
  layer: Container;
  textures: Textures;
  onBuyBird(species: number): void;
  onToggleTree(): void;
  onScreen(screen: "farm" | "kitchen"): void;
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

  const treeText = new Text({
    text: "Skill tree",
    style: { fontFamily: FONT, fontSize: 14, fontWeight: "700", fill: "#fff" },
  });
  treeText.anchor.set(0.5);
  const treeFeather = new Sprite(deps.textures.icons.feather);
  treeFeather.anchor.set(0, 0.5);
  treeFeather.scale.set(1.8);
  const treeLabel = new Container();
  treeText.x = -Math.ceil(treeFeather.width / 2) - 2;
  treeFeather.position.set(treeText.x + treeText.width / 2 + 4, 0);
  treeLabel.addChild(treeText, treeFeather);
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

  // Farm/Kitchen tabs — hidden until the kitchen gate is bought.
  const TAB_W = 44;
  const makeTab = (icon: Sprite, screen: "farm" | "kitchen") => {
    const label = icon;
    label.anchor.set(0.5);
    const b = pixelButton({
      w: TAB_W,
      h: BTN_H,
      face: 0x3a5a2f,
      frame: FRAME,
      content: label,
      onTap: () => {
        audioInit();
        deps.onScreen(screen);
      },
    });
    b.root.visible = false;
    layer.addChild(b.root);
    return b;
  };
  const farmIcon = new Sprite(deps.textures.bird[0]);
  farmIcon.scale.set(2);
  const kitchenIcon = new Sprite(deps.textures.pan);
  kitchenIcon.scale.set(2.2);
  const tabFarm = makeTab(farmIcon, "farm");
  const tabKitchen = makeTab(kitchenIcon, "kitchen");
  let activeScreen: "farm" | "kitchen" = "farm";
  let tabsShown = false;
  const applyTabAlpha = (): void => {
    tabFarm.root.alpha = activeScreen === "farm" ? 1 : 0.55;
    tabKitchen.root.alpha = activeScreen === "kitchen" ? 1 : 0.55;
  };

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

  let lastH = 844;
  let lastSafe = 0;
  function relayout(): void {
    layer.y = lastH - BAR_H - lastSafe;
    const treeW = Math.max(96, Math.round(W * 0.26));
    const tabsW = tabsShown ? 2 * (TAB_W + GAP) : 0;
    stripW = W - PAD * 3 - treeW - tabsW;
    face.clear();
    face.rect(0, 0, W, BAR_H + lastSafe).fill(BAR_FACE);
    treeBtn.resize(treeW, BTN_H);
    treeBtn.root.position.set(W - PAD - treeW, PAD);
    tabKitchen.root.position.set(W - PAD - treeW - GAP - TAB_W, PAD);
    tabFarm.root.position.set(W - PAD - treeW - 2 * (GAP + TAB_W), PAD);
    stripMask.clear();
    stripMask.rect(PAD, PAD, stripW, BTN_H).fill(0xffffff);
    stripHit.clear();
    stripHit.rect(PAD, PAD, stripW, BTN_H).fill({ color: 0xffffff, alpha: 0.001 });
    stripHit.hitArea = new Rectangle(PAD, PAD, stripW, BTN_H);
    layoutStrip();
  }

  return {
    setScreen(screen: "farm" | "kitchen"): void {
      activeScreen = screen;
      applyTabAlpha();
    },
    refresh(): void {
      const showTabs = kitchenUnlocked(sim);
      if (showTabs !== tabsShown) {
        tabsShown = showTabs;
        tabFarm.root.visible = showTabs;
        tabKitchen.root.visible = showTabs;
        relayout();
        applyTabAlpha();
      }
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
      lastH = h;
      lastSafe = safeBottom;
      relayout();
    },
  };
}

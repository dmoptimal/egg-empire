// Basket + truck views. The fill overlay and rim eggs are children of the
// basket sprite, so their coordinates are anchor-relative (CLAUDE.md gotcha:
// with anchor (0.5,1), "inside the basket" is x∈[-7,7], y∈[-9,-2]).
// Fill/label redraw when the count or cap changes; the countdown text only
// rewrites when the displayed second changes (shownT pattern).

import { BitmapText, Container, Graphics, Sprite, Text } from "pixi.js";
import { basketCap, truckCountdown, type SimState } from "../sim";
import { FONT, HOT_FONT } from "../ui/kit";
import type { Textures } from "./textures";

interface BasketView {
  /**
   * Wrapper at the sprite's anchor point (v8 deprecates children on Sprites).
   * Scale lives here, so fill/rim-egg coordinates stay anchor-relative
   * exactly as in the prototype: x∈[-7,7], y∈[-9,-2] is inside the basket.
   */
  root: Container;
  fill: Graphics;
  topEggs: Sprite[];
  label: BitmapText;
  timer: Text;
  timerIcon: Sprite;
  truck: Sprite;
  wiggle: number;
  shownT: number;
  lastCount: number;
  lastCap: number;
}

export interface BasketViews {
  sync(sim: SimState): void;
  layout(sim: SimState): void;
  wiggleAll(): void;
  update(sim: SimState, dt: number): void;
}

export function createBasketViews(
  basketLayer: Container,
  truckLayer: Container,
  textures: Textures,
): BasketViews {
  const views: BasketView[] = [];

  function addView(): void {
    const root = new Container();
    root.scale.set(3.2);
    const sp = new Sprite(textures.basket);
    sp.anchor.set(0.5, 1);
    root.addChild(sp);
    const fill = new Graphics();
    root.addChild(fill);
    const topEggs: Sprite[] = [];
    for (let k = 0; k < 3; k++) {
      const eg = new Sprite(textures.egg[0]);
      eg.anchor.set(0.5, 1);
      eg.scale.set(0.85);
      eg.position.set([-4.5, 0, 4.5][k], [-6, -7.5, -6][k]);
      eg.rotation = [-0.2, 0, 0.25][k];
      eg.visible = false;
      root.addChild(eg);
      topEggs.push(eg);
    }
    const label = new BitmapText({
      text: "0/12",
      style: { fontFamily: HOT_FONT, fontSize: 14 },
    });
    label.anchor.set(0.5, 1);
    const timer = new Text({
      text: "",
      style: {
        fontFamily: FONT,
        fill: "#8fe3d0",
        fontSize: 11,
        fontWeight: "700",
        stroke: { color: "#000", width: 3 },
      },
    });
    timer.anchor.set(0.5, 1);
    const timerIcon = new Sprite(textures.truck);
    timerIcon.anchor.set(1, 1);
    timerIcon.scale.set(0.9);
    timerIcon.visible = false;
    const truck = new Sprite(textures.truck);
    truck.anchor.set(0.5, 1);
    truck.scale.set(3);
    truck.x = -120;
    basketLayer.addChild(root);
    truckLayer.addChild(truck, label, timer, timerIcon);
    views.push({ root, fill, topEggs, label, timer, timerIcon, truck, wiggle: 0, shownT: -1, lastCount: -1, lastCap: -1 });
  }

  function redrawFill(sim: SimState, i: number): void {
    const v = views[i];
    const b = sim.baskets[i];
    const cap = basketCap(sim);
    const f = Math.min(b.count / cap, 1);
    v.fill.clear();
    if (f > 0) v.fill.rect(-7, -2 - f * 7, 14, f * 7).fill(0xfff3da);
    v.topEggs[0].visible = f >= 0.55;
    v.topEggs[1].visible = f >= 0.8;
    v.topEggs[2].visible = f >= 1;
    v.label.text = `${b.count}/${cap}`; // may exceed cap while the truck is en route
    v.lastCount = b.count;
    v.lastCap = cap;
  }

  function layoutViews(sim: SimState): void {
    const { basketY, roadY } = sim.layout;
    views.forEach((v, i) => {
      const b = sim.baskets[i];
      if (!b) return;
      v.root.position.set(b.x, basketY);
      v.label.position.set(b.x, basketY - 34);
      v.timer.position.set(b.x, basketY - 48);
      v.truck.y = roadY - 10 + (i % 2) * 8;
    });
  }

  return {
    sync(sim: SimState): void {
      let added = false;
      while (views.length < sim.baskets.length) {
        addView();
        added = true;
      }
      if (added) {
        layoutViews(sim); // a new basket shifts every basket's x
        views.forEach((_, i) => redrawFill(sim, i));
      }
    },
    layout: layoutViews,
    wiggleAll(): void {
      for (const v of views) v.wiggle = 1;
    },
    update(sim: SimState, dt: number): void {
      for (let i = 0; i < views.length; i++) {
        const v = views[i];
        const b = sim.baskets[i];
        if (!b) continue;
        if (b.count !== v.lastCount || basketCap(sim) !== v.lastCap) redrawFill(sim, i);
        v.truck.x = b.truckX;
        const left = truckCountdown(sim, b);
        const shown = left ?? -1;
        if (shown !== v.shownT) {
          v.shownT = shown;
          v.timer.text = left === null ? "" : `${left}s`;
          v.timerIcon.visible = left !== null;
          v.timerIcon.x = v.timer.x - v.timer.width / 2 - 4;
        }
        if (v.wiggle > 0) {
          v.wiggle -= dt * 3;
          v.root.rotation = Math.sin(v.wiggle * 30) * 0.12 * v.wiggle;
        } else {
          v.root.rotation = 0;
        }
      }
    },
  };
}

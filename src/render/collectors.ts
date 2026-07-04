// Collector sprites: position/facing from the sim; the carried-egg sprite and
// "×N" bag count only re-render when the bag actually changes.

import { Container, Sprite, Text } from "pixi.js";
import { SPECIES } from "../config/species";
import type { SimState } from "../sim";
import { FONT } from "../ui/kit";
import { eggSpriteScale, type Textures } from "./textures";

interface CollectorView {
  /**
   * Wrapper at the sprite's anchor point (v8 deprecates children on Sprites);
   * carries the ×3 scale and the facing flip, so carry/bagTxt coordinates are
   * anchor-relative as in the prototype.
   */
  root: Container;
  carry: Sprite;
  bagTxt: Text;
  lastBagLen: number;
  lastTopKey: number; // species*2 + golden of the bag's top egg, -1 = empty
}

export interface CollectorViews {
  sync(sim: SimState): void;
  update(sim: SimState): void;
}

export function createCollectorViews(layer: Container, textures: Textures): CollectorViews {
  const views: CollectorView[] = [];

  function addView(sim: SimState, i: number): void {
    const c = sim.collectors[i];
    const root = new Container();
    root.scale.set(3);
    const body = new Sprite(textures.coll);
    body.anchor.set(0.5, 1);
    root.addChild(body);
    const carry = new Sprite(textures.egg[0]);
    carry.anchor.set(0.5);
    carry.scale.set(0.9);
    carry.y = -14;
    carry.visible = false;
    root.addChild(carry);
    const bagTxt = new Text({
      text: "",
      style: {
        fontFamily: FONT,
        fill: "#fff",
        fontSize: 8,
        fontWeight: "700",
        stroke: { color: "#000", width: 2 },
      },
    });
    bagTxt.anchor.set(0, 0.5);
    bagTxt.position.set(2, -14);
    root.addChild(bagTxt);
    root.position.set(c.x, c.y);
    layer.addChild(root);
    views.push({ root, carry, bagTxt, lastBagLen: -1, lastTopKey: -1 });
  }

  return {
    sync(sim: SimState): void {
      while (views.length < sim.collectors.length) addView(sim, views.length);
    },
    update(sim: SimState): void {
      for (let i = 0; i < views.length; i++) {
        const v = views[i];
        const c = sim.collectors[i];
        if (!c) continue;
        v.root.position.set(c.x, c.y);
        v.root.scale.x = 3 * c.facing;
        v.bagTxt.scale.x = c.facing; // counter-flip so the count never mirrors
        const top = c.bag.length ? c.bag[c.bag.length - 1] : null;
        const topKey = top ? top.species * 2 + (top.golden ? 1 : 0) : -1;
        if (topKey !== v.lastTopKey) {
          v.lastTopKey = topKey;
          if (!top) {
            v.carry.visible = false;
          } else {
            v.carry.texture = top.golden ? textures.gold : textures.egg[top.species];
            v.carry.scale.set(eggSpriteScale(SPECIES[top.species].eggScale, top.golden) * 0.35);
            v.carry.visible = true;
          }
        }
        if (c.bag.length !== v.lastBagLen) {
          v.lastBagLen = c.bag.length;
          v.bagTxt.text = c.bag.length > 1 ? `×${c.bag.length}` : "";
        }
      }
    },
  };
}

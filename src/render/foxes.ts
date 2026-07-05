// Fox sprites (day/night cycle): pooled, mapped to sim foxes by id with
// zero allocation in the loop — same pattern as the kitchen customers.
// Climbers slink with a sway; fleers squash down and sprint, showing the
// stolen egg if they got one.

import { Container, Sprite, type Texture } from "pixi.js";
import type { SimState } from "../sim";
import type { Textures } from "./textures";

const FOX_POOL = 12; // night spawns every 4-8s over a 40s night — 12 is roomy

interface FoxView {
  root: Container;
  body: Sprite;
  egg: Sprite;
  /** The stolen bird dangling from its jaws (fox-stole-bird). */
  bird: Sprite;
  id: number;
}

export interface FoxViews {
  update(sim: SimState, now: number): void;
}

export function createFoxViews(layer: Container, textures: Textures): FoxViews {
  const views: FoxView[] = [];
  for (let i = 0; i < FOX_POOL; i++) {
    const root = new Container();
    const body = new Sprite(textures.fox as Texture);
    body.anchor.set(0.5, 1);
    body.scale.set(3);
    const egg = new Sprite(textures.egg[0]);
    egg.anchor.set(0.5);
    egg.scale.set(2);
    egg.y = -34;
    egg.visible = false;
    const bird = new Sprite(textures.bird[0]);
    bird.anchor.set(0.5);
    bird.scale.set(1.4);
    bird.y = -36;
    bird.rotation = 0.5; // dangling, protesting
    bird.visible = false;
    root.addChild(body, egg, bird);
    root.visible = false;
    layer.addChild(root);
    views.push({ root, body, egg, bird, id: -1 });
  }

  return {
    update(sim: SimState, now: number): void {
      for (let vi = 0; vi < views.length; vi++) {
        const v = views[vi];
        if (v.id === -1) continue;
        let alive = false;
        for (let fi = 0; fi < sim.foxes.length; fi++)
          if (sim.foxes[fi].id === v.id) {
            alive = true;
            break;
          }
        if (!alive) {
          v.id = -1;
          v.root.visible = false;
        }
      }
      for (let fi = 0; fi < sim.foxes.length; fi++) {
        const f = sim.foxes[fi];
        let v: FoxView | null = null;
        for (let vi = 0; vi < views.length; vi++)
          if (views[vi].id === f.id) {
            v = views[vi];
            break;
          }
        if (!v) {
          for (let vi = 0; vi < views.length; vi++)
            if (views[vi].id === -1) {
              v = views[vi];
              break;
            }
          if (!v) continue; // pool exhausted — sim keeps counting, view skips
          v.id = f.id;
          v.egg.visible = false;
          v.bird.visible = false;
          v.root.visible = true;
        }
        const fleeing = f.state === "flee";
        v.root.x = f.x + Math.sin(now * (fleeing ? 14 : 6) + f.id) * (fleeing ? 2 : 5);
        v.root.y = f.y;
        v.body.scale.y = fleeing ? 2.4 : 3; // squashed sprint on the way out
        v.egg.visible = f.carrying;
        if (f.bird !== undefined && !v.bird.visible) {
          v.bird.texture = textures.bird[f.bird];
          v.bird.visible = true;
        }
      }
    },
  };
}

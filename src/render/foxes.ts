// Fox + Night-guard sprites (day/night cycle): pooled, mapped to sim foxes
// by id with zero allocation in the loop — same pattern as the kitchen
// customers. Climbers slink with a sway; fleers squash down and sprint,
// showing the stolen egg or bird if they got one. Guards stand the patrol
// line at night (one sprite per node level) and lunge when they shoo.

import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { guardLineY, guardX, lvl, type SimState } from "../sim";
import type { Textures } from "./textures";

const FOX_POOL = 12; // night spawns every 4-8s over a 40s night — 12 is roomy
const GUARD_MAX = 3;

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
  /** A guard shooed a fox at x — the nearest watchman lunges. */
  guardLunge(x: number): void;
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

  // the watch: one visible guard per node level, spread along the line
  interface GuardView {
    root: Container;
    glow: Graphics;
    punch: number;
  }
  const guards: GuardView[] = [];
  for (let i = 0; i < GUARD_MAX; i++) {
    const root = new Container();
    const glow = new Graphics();
    glow.circle(0, -14, 16).fill({ color: 0xffd94a, alpha: 0.14 });
    const body = new Sprite(textures.guard);
    body.anchor.set(0.5, 1);
    body.scale.set(3);
    root.addChild(glow, body);
    root.visible = false;
    layer.addChild(root);
    guards.push({ root, glow, punch: 0 });
  }

  return {
    guardLunge(x: number): void {
      let best: GuardView | null = null;
      let bd = Infinity;
      for (const g of guards) {
        if (!g.root.visible) continue;
        const d = Math.abs(g.root.x - x);
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      if (best) best.punch = 1;
    },
    update(sim: SimState, now: number): void {
      // guards on the line, at night only
      const g = Math.min(lvl(sim, "guard"), GUARD_MAX);
      const lineY = guardLineY(sim) + 20;
      for (let i = 0; i < GUARD_MAX; i++) {
        const gv = guards[i];
        const on = sim.clock.night && i < g;
        gv.root.visible = on;
        if (!on) continue;
        gv.punch = Math.max(0, gv.punch - 0.05);
        gv.root.x = guardX(sim, i, g) + Math.sin(now * 0.7 + i * 2.1) * 14;
        gv.root.y = lineY + Math.sin(now * 1.6 + i) * 2 - gv.punch * 10;
        gv.root.scale.set(1 + gv.punch * 0.25);
        gv.glow.alpha = 0.7 + 0.3 * Math.sin(now * 3 + i);
      }
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
        // the gallery reads at a glance: kits are small, bruisers loom,
        // sneaks fade into the grass whenever they freeze
        const base = f.kind === "kit" ? 2.1 : f.kind === "bruiser" ? 3.8 : 3;
        v.body.tint = f.kind === "sneak" ? 0x9fb0cc : f.kind === "bruiser" ? 0xcc8866 : 0xffffff;
        v.root.alpha = f.kind === "sneak" && !fleeing && f.pauseT > 0 ? 0.4 : 1;
        const rattle = f.kind === "bruiser" && !fleeing && f.pauseT > 0 ? Math.sin(now * 40) * 3 : 0;
        v.root.x = f.x + Math.sin(now * (fleeing ? 14 : 6) + f.id) * (fleeing ? 2 : 5) + rattle;
        v.root.y = f.y;
        v.body.scale.x = base;
        v.body.scale.y = fleeing ? base * 0.8 : base; // squashed sprint out
        v.egg.visible = f.carrying;
        if (f.carrying && f.loot) v.egg.texture = textures.egg[f.loot.species];
        const hasBird = f.bird !== undefined;
        if (hasBird) v.bird.texture = textures.bird[f.bird as number];
        v.bird.visible = hasBird; // re-hidden the moment a rescue frees it
      }
    },
  };
}

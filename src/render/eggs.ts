// Egg sprites: a fixed pool sized to the sim's hard bound (EGG_CAP + 40),
// mapped to sim eggs by id. Acquire/release are event-driven; positions are
// re-derived from sim state every frame with zero allocation.

import { Sprite, type Container } from "pixi.js";
import { EGG_ARC_LIFT, EGG_FADE_TIME, EGG_POOL_EXTRA } from "../config/constants";
import { EGG_CAP, EGG_LIFE, SPECIES } from "../config/species";
import type { Egg, SimState } from "../sim";
import { eggSpriteScale, type Textures } from "./textures";

export interface EggSprites {
  acquire(egg: Egg): void;
  release(eggId: number): void;
  update(sim: SimState, now: number, dt: number): void;
}

export function createEggSprites(layer: Container, textures: Textures): EggSprites {
  const pool: Sprite[] = [];
  const free: number[] = [];
  const slotByEgg = new Map<number, number>();
  for (let i = 0; i < EGG_CAP + EGG_POOL_EXTRA; i++) {
    const sp = new Sprite(textures.egg[0]);
    sp.anchor.set(0.5);
    sp.visible = false;
    layer.addChild(sp);
    pool.push(sp);
    free.push(i);
  }

  function spriteFor(e: Egg): Sprite | undefined {
    const slot = slotByEgg.get(e.id);
    return slot === undefined ? undefined : pool[slot];
  }

  return {
    acquire(egg: Egg): void {
      const slot = free.pop();
      if (slot === undefined) return; // sim bounds make this unreachable
      slotByEgg.set(egg.id, slot);
      const sp = pool[slot];
      sp.texture = egg.golden ? textures.gold : textures.egg[egg.species];
      sp.scale.set(eggSpriteScale(SPECIES[egg.species].eggScale, egg.golden));
      sp.alpha = 1;
      sp.rotation = 0;
      sp.position.set(egg.x, egg.y);
      sp.visible = true;
    },
    release(eggId: number): void {
      const slot = slotByEgg.get(eggId);
      if (slot === undefined) return;
      slotByEgg.delete(eggId);
      pool[slot].visible = false;
      free.push(slot);
    },
    update(sim: SimState, now: number, dt: number): void {
      for (const e of sim.falling) {
        const sp = spriteFor(e);
        if (sp) sp.position.set(e.x, e.y);
      }
      for (const e of sim.ground) {
        const sp = spriteFor(e);
        if (!sp) continue;
        sp.position.set(e.x, e.y);
        sp.alpha = e.age > EGG_LIFE - EGG_FADE_TIME ? (EGG_LIFE - e.age) / EGG_FADE_TIME : 1;
        if (e.golden)
          sp.scale.set(SPECIES[e.species].eggScale * 1.15 * (1 + Math.sin(now * 6) * 0.07));
      }
      for (const e of sim.flying) {
        const sp = spriteFor(e);
        if (!sp) continue;
        // Quadratic bezier from the sweep point into the basket mouth.
        const t = e.flyT;
        const mx = (e.sx + e.tx) / 2;
        const my = Math.min(e.sy, e.ty) - EGG_ARC_LIFT;
        sp.x = (1 - t) * (1 - t) * e.sx + 2 * (1 - t) * t * mx + t * t * e.tx;
        sp.y = (1 - t) * (1 - t) * e.sy + 2 * (1 - t) * t * my + t * t * e.ty;
        sp.rotation += 6 * dt;
      }
    },
  };
}

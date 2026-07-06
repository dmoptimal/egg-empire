// Moon eggs + fireflies (the night farm toys): pooled sprites mapped onto
// sim lists by id, zero allocation in the loop — same pattern as the foxes.
// This layer sits ABOVE the night wash so both glow against the dark; all
// sway and pulsing is render-side, the sim owns the tappable positions.

import { Container, Graphics, Sprite } from "pixi.js";
import type { SimState } from "../sim";
import type { Textures } from "./textures";

const MOON_POOL = 8; //  spawn gap 9-15s over a 150s night — 8 is roomy
const FLY_POOL = 12; //  FIREFLY_CAP is 9

interface MoonView {
  root: Container;
  glow: Graphics;
  id: number;
}

interface FlyView {
  sp: Sprite;
  id: number;
}

export interface NightLife {
  update(sim: SimState, now: number): void;
}

export function createNightLife(layer: Container, textures: Textures): NightLife {
  const moons: MoonView[] = [];
  for (let i = 0; i < MOON_POOL; i++) {
    const root = new Container();
    const glow = new Graphics();
    glow.circle(0, 0, 16).fill({ color: 0xbfe3ff, alpha: 0.22 });
    const egg = new Sprite(textures.moon);
    egg.anchor.set(0.5);
    egg.scale.set(3.4);
    root.addChild(glow, egg);
    root.visible = false;
    root.eventMode = "none";
    layer.addChild(root);
    moons.push({ root, glow, id: -1 });
  }
  const flies: FlyView[] = [];
  for (let i = 0; i < FLY_POOL; i++) {
    const sp = new Sprite(textures.firefly);
    sp.anchor.set(0.5);
    sp.scale.set(3);
    sp.visible = false;
    sp.eventMode = "none";
    layer.addChild(sp);
    flies.push({ sp, id: -1 });
  }

  return {
    update(sim: SimState, now: number): void {
      for (const v of moons)
        if (v.id !== -1 && !sim.moonEggs.some((m) => m.id === v.id)) {
          v.id = -1;
          v.root.visible = false;
        }
      for (const m of sim.moonEggs) {
        let v = moons.find((mv) => mv.id === m.id) ?? null;
        if (!v) {
          v = moons.find((mv) => mv.id === -1) ?? null;
          if (!v) continue;
          v.id = m.id;
          v.root.visible = true;
        }
        v.root.x = m.x + Math.sin(now * 2 + m.id) * 8; // lazy pendulum fall
        v.root.y = m.y;
        v.glow.alpha = 0.8 + 0.2 * Math.sin(now * 4 + m.id);
      }
      for (const v of flies)
        if (v.id !== -1 && !sim.fireflies.some((f) => f.id === v.id)) {
          v.id = -1;
          v.sp.visible = false;
        }
      for (const f of sim.fireflies) {
        let v = flies.find((fv) => fv.id === f.id) ?? null;
        if (!v) {
          v = flies.find((fv) => fv.id === -1) ?? null;
          if (!v) continue;
          v.id = f.id;
          v.sp.visible = true;
        }
        v.sp.x = f.x;
        v.sp.y = f.y + Math.sin(now * 3 + f.id) * 4;
        // soft blink, plus a fade-out over the last couple of seconds
        v.sp.alpha = (0.55 + 0.45 * Math.sin(now * 5 + f.id * 2)) * Math.min(1, f.life / 2);
      }
    },
  };
}

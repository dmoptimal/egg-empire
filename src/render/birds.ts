// Bird sprites. Purely visual: capped at BIRD_VIEW_CAP per species however
// many the sim owns (CLAUDE.md two-system rule). Doubles as the sim's
// spawnPoint hook so eggs drop from a bird that is actually on screen.

import { Sprite, type Container } from "pixi.js";
import { BIRD_MAX_Y_INSET, BIRD_MIN_X, BIRD_MIN_Y, BIRD_SPAWN_BAND, BIRD_SPAWN_BAND_MIN } from "../config/constants";
import { BIRD_VIEW_CAP, SPECIES } from "../config/species";
import type { Layout, SimState, SpawnPoint } from "../sim";
import type { Textures } from "./textures";

interface BirdView {
  sp: Sprite;
  x: number; // base position — the waddle animates around it
  y: number;
  phase: number;
}

export interface Birds {
  sync(sim: SimState): void;
  clamp(layout: Layout): void;
  update(now: number): void;
  spawnPoint(species: number): SpawnPoint | null;
}

export function createBirds(layer: Container, textures: Textures, getLayout: () => Layout): Birds {
  const views: BirdView[][] = SPECIES.map(() => []);

  function add(i: number): void {
    if (views[i].length >= BIRD_VIEW_CAP) return;
    const { w, hayTop } = getLayout();
    const sp = new Sprite(textures.bird[i]);
    sp.anchor.set(0.5, 1);
    sp.scale.set(textures.birdScale[i]);
    if (Math.random() < 0.5) sp.scale.x *= -1;
    layer.addChild(sp);
    views[i].push({
      sp,
      x: BIRD_MIN_X + Math.random() * (w - BIRD_MIN_X * 2),
      y: BIRD_MIN_Y + Math.random() * Math.max(hayTop - BIRD_SPAWN_BAND, BIRD_SPAWN_BAND_MIN),
      phase: Math.random() * 6.28,
    });
  }

  return {
    sync(sim: SimState): void {
      SPECIES.forEach((_, i) => {
        while (views[i].length < Math.min(sim.counts[i], BIRD_VIEW_CAP)) add(i);
      });
    },
    // Keep every bird inside the tappable field, whatever size the canvas
    // settles at (prototype: layout()).
    clamp(layout: Layout): void {
      for (const arr of views)
        for (const b of arr) {
          b.x = Math.min(Math.max(b.x, BIRD_MIN_X), Math.max(layout.w - BIRD_MIN_X, BIRD_MIN_X));
          b.y = Math.min(Math.max(b.y, BIRD_MIN_Y), Math.max(layout.hayTop - BIRD_MAX_Y_INSET, BIRD_MIN_Y));
        }
    },
    update(now: number): void {
      for (const arr of views)
        for (const b of arr) {
          b.sp.x = b.x + Math.sin(now * 1.1 + b.phase) * 10;
          b.sp.y = b.y + Math.sin(now * 0.8 + b.phase * 2) * 4;
        }
    },
    spawnPoint(species: number): SpawnPoint | null {
      const arr = views[species];
      if (!arr.length) return null;
      const b = arr[(Math.random() * arr.length) | 0];
      return { x: b.x, y: b.y };
    },
  };
}

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
  /** Where this bird sleeps: a spot on the roost row along the very top. */
  rx: number;
  ry: number;
  /** Animated position, eased between field and roost at dusk/dawn. */
  cx: number;
  cy: number;
  phase: number;
}

export interface Birds {
  sync(sim: SimState): void;
  clamp(layout: Layout): void;
  update(now: number, dt: number, night: boolean): void;
  spawnPoint(species: number): SpawnPoint | null;
}

export function createBirds(layer: Container, textures: Textures, getLayout: () => Layout): Birds {
  const views: BirdView[][] = SPECIES.map(() => []);
  let totalAdded = 0;

  function add(i: number): void {
    if (views[i].length >= BIRD_VIEW_CAP) return;
    const { w, hayTop } = getLayout();
    const sp = new Sprite(textures.bird[i]);
    sp.anchor.set(0.5, 1);
    sp.scale.set(textures.birdScale[i]);
    if (Math.random() < 0.5) sp.scale.x *= -1;
    layer.addChild(sp);
    const x = BIRD_MIN_X + Math.random() * (w - BIRD_MIN_X * 2);
    const y = BIRD_MIN_Y + Math.random() * Math.max(hayTop - BIRD_SPAWN_BAND, BIRD_SPAWN_BAND_MIN);
    const idx = totalAdded++;
    views[i].push({
      sp,
      x,
      y,
      rx: 14 + ((idx * 37) % Math.max(w - 28, 40)),
      ry: 56 + (idx % 3) * 11, // roost row sits clear of the HUD chips
      cx: x,
      cy: y,
      phase: Math.random() * 6.28,
    });
  }

  return {
    sync(sim: SimState): void {
      SPECIES.forEach((_, i) => {
        while (views[i].length < Math.min(sim.counts[i], BIRD_VIEW_CAP)) add(i);
        // foxes can shrink the flock now — retire the extra sprites
        while (views[i].length > Math.min(Math.max(sim.counts[i], 0), BIRD_VIEW_CAP))
          views[i].pop()!.sp.destroy();
      });
    },
    // Keep every bird inside the tappable field, whatever size the canvas
    // settles at (prototype: layout()).
    clamp(layout: Layout): void {
      for (const arr of views)
        for (const b of arr) {
          b.x = Math.min(Math.max(b.x, BIRD_MIN_X), Math.max(layout.w - BIRD_MIN_X, BIRD_MIN_X));
          b.y = Math.min(Math.max(b.y, BIRD_MIN_Y), Math.max(layout.hayTop - BIRD_MAX_Y_INSET, BIRD_MIN_Y));
          b.rx = Math.min(b.rx, Math.max(layout.w - 14, 14));
        }
    },
    update(now: number, dt: number, night: boolean): void {
      // Ease toward the roost row at dusk, back to the field at dawn;
      // waddling stops on the roost (just a faint sleepy bob).
      const k = Math.min(1, dt * 1.6);
      for (const arr of views)
        for (const b of arr) {
          b.cx += ((night ? b.rx : b.x) - b.cx) * k;
          b.cy += ((night ? b.ry : b.y) - b.cy) * k;
          const amp = night ? 0 : 1;
          b.sp.x = b.cx + Math.sin(now * 1.1 + b.phase) * 10 * amp;
          b.sp.y = b.cy + Math.sin(now * 0.8 + b.phase * 2) * 4 * amp + (night ? Math.sin(now * 2 + b.phase) * 1.5 : 0);
        }
    },
    spawnPoint(species: number): SpawnPoint | null {
      const arr = views[species];
      if (!arr.length) return null;
      const b = arr[(Math.random() * arr.length) | 0];
      return { x: b.cx, y: b.cy };
    },
  };
}

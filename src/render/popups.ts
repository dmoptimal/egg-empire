// Floating text popups — fixed pool of 60, oldest silently recycled
// (ring buffer). Hot text: BitmapText on the baked Pixelify font, tinted
// per spawn (the black baked stroke stays black under tint).

import { BitmapText, type Container } from "pixi.js";
import { HOT_FONT } from "../ui/kit";

interface Popup {
  t: BitmapText;
  vy: number;
  life: number;
  active: boolean;
}

export interface Popups {
  spawn(x: number, y: number, txt: string, color: number, size?: number): void;
  update(dt: number): void;
}

const POPUP_POOL = 60;

export function createPopups(layer: Container): Popups {
  const pool: Popup[] = [];
  for (let i = 0; i < POPUP_POOL; i++) {
    const t = new BitmapText({ text: "", style: { fontFamily: HOT_FONT, fontSize: 14 } });
    t.anchor.set(0.5);
    t.visible = false;
    layer.addChild(t);
    pool.push({ t, vy: 0, life: 0, active: false });
  }
  let cur = 0;

  return {
    spawn(x: number, y: number, txt: string, color: number, size = 14): void {
      const p = pool[cur];
      cur = (cur + 1) % pool.length;
      p.t.text = txt;
      p.t.tint = color;
      p.t.style.fontSize = size;
      p.t.position.set(x, y);
      p.t.alpha = 1;
      p.t.visible = true;
      p.vy = -52;
      p.life = 1;
      p.active = true;
    },
    update(dt: number): void {
      for (const p of pool) {
        if (!p.active) continue;
        p.life -= dt * 0.9;
        if (p.life <= 0) {
          p.active = false;
          p.t.visible = false;
          continue;
        }
        p.t.y += p.vy * dt;
        p.t.alpha = Math.min(1, p.life * 1.6);
      }
    },
  };
}

// Floating text popups — fixed pool of 60, oldest silently recycled
// (ring buffer). Hot text: BitmapText on the baked Pixelify font, tinted
// per spawn (the black baked stroke stays black under tint).

import { BitmapText, Sprite, Texture, type Container } from "pixi.js";
import { HOT_FONT } from "../ui/kit";

interface Popup {
  t: BitmapText;
  icon: Sprite;
  vy: number;
  life: number;
  active: boolean;
}

export interface Popups {
  spawn(x: number, y: number, txt: string, color: number, size?: number, icon?: Texture): void;
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
    const icon = new Sprite();
    icon.anchor.set(0, 0.5);
    icon.visible = false;
    layer.addChild(icon);
    pool.push({ t, icon, vy: 0, life: 0, active: false });
  }
  let cur = 0;

  return {
    spawn(x: number, y: number, txt: string, color: number, size = 14, icon?: Texture): void {
      const p = pool[cur];
      cur = (cur + 1) % pool.length;
      p.t.text = txt;
      p.t.tint = color;
      p.t.style.fontSize = size;
      p.t.position.set(x, y);
      p.t.alpha = 1;
      p.t.visible = true;
      if (icon) {
        p.icon.texture = icon;
        p.icon.scale.set(Math.max(1.4, size / 9));
        p.icon.position.set(x + p.t.width / 2 + 4, y);
        p.icon.alpha = 1;
        p.icon.visible = true;
      } else {
        p.icon.visible = false;
      }
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
          p.icon.visible = false;
          continue;
        }
        p.t.y += p.vy * dt;
        p.t.alpha = Math.min(1, p.life * 1.6);
        if (p.icon.visible) {
          p.icon.y = p.t.y;
          p.icon.alpha = p.t.alpha;
        }
      }
    },
  };
}

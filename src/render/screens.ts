// Title and win screens — pure Pixi, ported from the prototype.

import { Graphics, Sprite, Text, type Container } from "pixi.js";
import type { Layout } from "../sim";
import type { Textures } from "./textures";

export interface StartScreen {
  position(layout: Layout): void;
  update(now: number): void;
  hide(): void;
  readonly visible: boolean;
}

export function createStartScreen(layer: Container, textures: Textures): StartScreen {
  const bg = new Graphics();
  layer.addChild(bg);
  const title = new Text({
    text: "EGG EMPIRE",
    style: { fill: "#ffd24a", fontSize: 10, fontWeight: "900", stroke: { color: "#000", width: 6 } },
  });
  title.anchor.set(0.5);
  layer.addChild(title);
  const birds: Sprite[] = [];
  for (let i = 0; i < 5; i++) {
    const s = new Sprite(textures.bird[i]);
    s.anchor.set(0.5, 1);
    layer.addChild(s);
    birds.push(s);
  }
  const tap = new Text({ text: "Tap to start", style: { fill: "#8fe3d0", fontSize: 16, fontWeight: "800" } });
  tap.anchor.set(0.5);
  layer.addChild(tap);

  return {
    position(layout: Layout): void {
      const { w: W, h: H } = layout;
      bg.clear();
      bg.rect(0, 0, Math.max(W, 900), Math.max(H, 900)).fill(0x14273a);
      const fs = Math.min(Math.floor(W / 6.2), 58);
      title.style.fontSize = fs;
      title.position.set(W / 2, H * 0.46);
      const top = title.y - title.height / 2;
      const w = title.width;
      for (let i = 0; i < 5; i++) {
        const s = birds[i];
        const sc = (i === 4 ? 2.0 : 2.6) * (fs / 58);
        s.scale.set(sc * (i % 2 ? -1 : 1), sc);
        s.position.set(W / 2 - w / 2 + w * (0.1 + 0.2 * i), top + 4);
      }
      tap.position.set(W / 2, H * 0.62);
    },
    update(now: number): void {
      for (let i = 0; i < 5; i++) birds[i].y += Math.sin(now * 2 + i) * 0.15;
      tap.alpha = 0.6 + Math.sin(now * 3) * 0.4;
    },
    hide(): void {
      layer.visible = false;
    },
    get visible(): boolean {
      return layer.visible;
    },
  };
}

export interface WinScreen {
  show(layout: Layout): void;
  hide(): void;
  readonly visible: boolean;
}

export function createWinScreen(layer: Container): WinScreen {
  return {
    show(layout: Layout): void {
      const { w: W, h: H } = layout;
      for (const c of layer.removeChildren()) c.destroy({ children: true });
      layer.visible = true;
      const g = new Graphics();
      g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.75 });
      const t1 = new Text({
        text: "🏆 SKILL TREE COMPLETE!",
        style: {
          fill: "#ffd24a",
          fontSize: 26,
          fontWeight: "900",
          stroke: { color: "#000", width: 5 },
          align: "center",
          wordWrap: true,
          wordWrapWidth: W - 40,
        },
      });
      t1.anchor.set(0.5);
      t1.position.set(W / 2, H * 0.4);
      const t2 = new Text({
        text: "You built the Egg Empire.\nTap to keep farming forever.",
        style: { fill: "#fff", fontSize: 15, fontWeight: "700", align: "center" },
      });
      t2.anchor.set(0.5);
      t2.position.set(W / 2, H * 0.52);
      layer.addChild(g, t1, t2);
    },
    hide(): void {
      layer.visible = false;
    },
    get visible(): boolean {
      return layer.visible;
    },
  };
}

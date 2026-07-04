// Title and win screens — pure Pixi. Boot shows a "created by" credit card
// first, then the title, where the perched birds idly lay eggs that tumble
// off the bottom of the screen (pooled, of course).

import { Graphics, Sprite, Text, type Container } from "pixi.js";
import { EGG_GRAVITY } from "../config/constants";
import type { Layout } from "../sim";
import { FONT } from "../ui/kit";
import type { Textures } from "./textures";

const CREDIT_HOLD = 1.7; // seconds before the credit fades into the title
const TITLE_EGG_POOL = 10;

export interface StartScreen {
  position(layout: Layout): void;
  update(now: number, dt: number, layout: Layout): void;
  hide(): void;
  readonly visible: boolean;
}

export function createStartScreen(layer: Container, textures: Textures): StartScreen {
  const bg = new Graphics();
  layer.addChild(bg);

  // title elements ----------------------------------------------------------
  const title = new Text({
    text: "EGG EMPIRE",
    style: { fontFamily: FONT, fill: "#ffd24a", fontSize: 10, fontWeight: "700", stroke: { color: "#000", width: 6 } },
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
  const tap = new Text({ text: "Tap to start", style: { fontFamily: FONT, fill: "#8fe3d0", fontSize: 16, fontWeight: "700" } });
  tap.anchor.set(0.5);
  layer.addChild(tap);

  // decorative eggs dropped by the perched birds -----------------------------
  interface TitleEgg {
    sp: Sprite;
    vy: number;
    active: boolean;
  }
  const eggs: TitleEgg[] = [];
  for (let i = 0; i < TITLE_EGG_POOL; i++) {
    const sp = new Sprite(textures.egg[0]);
    sp.anchor.set(0.5);
    sp.scale.set(2.4);
    sp.visible = false;
    layer.addChildAt(sp, 1); // behind the title text, above the bg
    eggs.push({ sp, vy: 0, active: false });
  }
  let nextLay = 1.2;

  // boot credit ---------------------------------------------------------------
  const creditSmall = new Text({
    text: "a game created by",
    style: { fontFamily: FONT, fontSize: 14, fill: "#8fa3b8" },
  });
  creditSmall.anchor.set(0.5);
  const creditBig = new Text({
    text: "DANIEL MASON",
    style: { fontFamily: FONT, fontSize: 28, fontWeight: "700", fill: "#ffd24a", stroke: { color: "#000", width: 5 } },
  });
  creditBig.anchor.set(0.5);
  layer.addChild(creditSmall, creditBig);
  let creditT = 0;

  const titleParts = [title, tap, ...birds];
  for (const t of titleParts) t.alpha = 0;

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
      creditSmall.position.set(W / 2, H * 0.44);
      creditBig.position.set(W / 2, H * 0.5);
    },
    update(now: number, dt: number, layout: Layout): void {
      creditT += dt;
      const credit = Math.max(0, Math.min(1, (CREDIT_HOLD + 0.4 - creditT) / 0.4));
      creditSmall.alpha = credit;
      creditBig.alpha = credit;
      const reveal = Math.max(0, Math.min(1, (creditT - CREDIT_HOLD) / 0.5));
      for (const t of titleParts) t.alpha = reveal;
      if (reveal <= 0) return;

      for (let i = 0; i < 5; i++) birds[i].y += Math.sin(now * 2 + i) * 0.15;
      tap.alpha = reveal * (0.6 + Math.sin(now * 3) * 0.4);

      // the perch drops an egg now and then; it tumbles off-screen
      nextLay -= dt;
      if (nextLay <= 0) {
        nextLay = 0.9 + Math.random() * 1.7;
        const e = eggs.find((x) => !x.active);
        if (e) {
          const i = (Math.random() * 5) | 0;
          e.sp.texture = textures.egg[i];
          e.sp.position.set(birds[i].x + (Math.random() * 10 - 5), birds[i].y + 4);
          e.sp.rotation = Math.random() * 6.28;
          e.sp.alpha = 1;
          e.vy = 20;
          e.active = true;
          e.sp.visible = true;
        }
      }
      for (const e of eggs) {
        if (!e.active) continue;
        e.vy += EGG_GRAVITY * 0.5 * dt; // lazy, floaty fall
        e.sp.y += e.vy * dt;
        e.sp.rotation += 2.4 * dt;
        if (e.sp.y > layout.h + 24) {
          e.active = false;
          e.sp.visible = false;
        }
      }
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

export function createWinScreen(layer: Container, textures: Textures): WinScreen {
  return {
    show(layout: Layout): void {
      const { w: W, h: H } = layout;
      for (const c of layer.removeChildren()) c.destroy({ children: true });
      layer.visible = true;
      const g = new Graphics();
      g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.75 });
      const trophy = new Sprite(textures.icons.trophy);
      trophy.anchor.set(0.5);
      trophy.scale.set(6);
      trophy.position.set(W / 2, H * 0.3);
      const t1 = new Text({
        text: "SKILL TREE COMPLETE!",
        style: {
          fontFamily: FONT,
          fill: "#ffd24a",
          fontSize: 26,
          fontWeight: "700",
          stroke: { color: "#000", width: 5 },
          align: "center",
          wordWrap: true,
          wordWrapWidth: W - 40,
        },
      });
      t1.anchor.set(0.5);
      t1.position.set(W / 2, H * 0.42);
      const t2 = new Text({
        text: "You built the Egg Empire.\nTap to keep farming forever.",
        style: { fontFamily: FONT, fill: "#fff", fontSize: 15, fontWeight: "700", align: "center" },
      });
      t2.anchor.set(0.5);
      t2.position.set(W / 2, H * 0.54);
      layer.addChild(g, trophy, t1, t2);
    },
    hide(): void {
      layer.visible = false;
    },
    get visible(): boolean {
      return layer.visible;
    },
  };
}

// ?anim=1 — the chicken animation lab (Dan, 2026-07-06). The 2× chicken
// walking, head-bobbing, laying eggs and sitting down to roost on a patch of
// grass, with every animation's frames laid out at the top exactly like the
// strips Dan will draw in Piskel/Pixelorama. Standalone dev page (same
// exemption as ?gfx=1): no sim, no save — pure render toy, so Math.random
// and per-page state are fine here.

import { Application, Container, Graphics, Sprite, Text, type Renderer, type Texture } from "pixi.js";
import { CHICK_ANIMS, CHICK_PAL, EGG2X, LAY_EGG_FRAME, withOutline } from "./render/chicken2x";
import { FramePlayer, type FrameAnim } from "./render/frameplayer";
import { FONT, loadPixelFont } from "./ui/kit";

const S = 3; //        field chicken scale
const STRIP_S = 2; //  reference strip scale
const WALK_SPD = 46; // px/s
const EGG_MAX = 40;

function mapTexture(renderer: Renderer, map: string[]): Texture {
  const g = new Graphics();
  map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") g.rect(x, y, 1, 1).fill(CHICK_PAL[ch]);
    }),
  );
  return renderer.generateTexture({ target: g, textureSourceOptions: { scaleMode: "nearest" } });
}

interface Chick {
  spr: Sprite;
  fp: FramePlayer;
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: 1 | -1;
  state: "idle" | "walk" | "lay" | "sit" | "sleep";
  goal: "wander" | "roost";
  wait: number;
  roostX: number;
}

export async function showAnimLab(): Promise<void> {
  const gameDiv = document.getElementById("game")!;
  const app = new Application();
  await app.init({
    resizeTo: gameDiv,
    background: 0x63a344,
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  gameDiv.appendChild(app.canvas);
  await loadPixelFont();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) app.ticker.stop();
    else app.ticker.start();
  });
  const W = app.screen.width;
  const H = app.screen.height;

  // grass checker, same pattern as the game field
  const grass = new Graphics();
  for (let y = 0; y < H; y += 44)
    for (let x = ((y / 44) % 2) * 22; x < W + 44; x += 44) grass.rect(x, y, 22, 22);
  grass.fill(0x5a9339);
  grass.eventMode = "none";
  app.stage.addChild(grass);

  // frame textures, one set shared by strips and field
  const anims = {} as Record<keyof typeof CHICK_ANIMS, FrameAnim>;
  for (const [name, def] of Object.entries(CHICK_ANIMS))
    anims[name as keyof typeof CHICK_ANIMS] = {
      frames: def.maps.map((m) => mapTexture(app.renderer, withOutline(m))),
      fps: def.fps,
      loop: def.loop,
    };
  const eggTex = mapTexture(app.renderer, withOutline(EGG2X));

  // ---- reference strips: the exact frames a drawn PNG strip would replace
  const strips = new Container();
  strips.eventMode = "none";
  let sy = 8;
  for (const [name, anim] of Object.entries(anims)) {
    const label = new Text({
      text: `${name} · ${anim.frames.length}f @ ${anim.fps}fps${anim.loop ? "" : " · once"}`,
      style: { fontFamily: FONT, fontSize: 11, fill: 0xffffff, stroke: { color: 0x2b3a24, width: 3 } },
    });
    label.position.set(10, sy);
    strips.addChild(label);
    anim.frames.forEach((f, i) => {
      const spr = new Sprite(f);
      spr.scale.set(STRIP_S);
      spr.position.set(10 + i * (24 * STRIP_S + 6), sy + 15);
      strips.addChild(spr);
    });
    sy += 15 + 22 * STRIP_S + 7;
  }
  const hint = new Text({
    text: "Tap a chicken for an egg — NIGHT sends them to roost",
    style: { fontFamily: FONT, fontSize: 11, fill: 0xfff3da, stroke: { color: 0x2b3a24, width: 3 } },
  });
  hint.position.set(10, sy + 2);
  strips.addChild(hint);
  app.stage.addChild(strips);

  // ---- roost rail
  const roostY = sy + 58;
  const rail = new Graphics();
  rail.rect(0, roostY - 2, W, 5).fill(0x6e4520);
  for (let x = 20; x < W; x += 64) rail.rect(x, roostY - 2, 4, 22).fill(0x5a3a1e);
  rail.eventMode = "none";
  app.stage.addChild(rail);

  // ---- eggs (fixed pool; oldest slot reused)
  const eggs: { spr: Sprite; age: number }[] = [];
  for (let i = 0; i < EGG_MAX; i++) {
    const spr = new Sprite(eggTex);
    spr.anchor.set(0.5, 1);
    spr.visible = false;
    spr.eventMode = "none";
    app.stage.addChild(spr);
    eggs.push({ spr, age: 0 });
  }
  let eggSeq = 0;
  const layEgg = (c: Chick): void => {
    const e = eggs[eggSeq++ % EGG_MAX];
    e.spr.position.set(c.x - c.dir * 26 + (Math.random() * 8 - 4), c.y + 2);
    e.spr.visible = true;
    e.spr.alpha = 1;
    e.age = 0;
  };

  // ---- chickens
  const FIELD_TOP = roostY + 60;
  const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
  let night = false;
  const chicks: Chick[] = [];

  const idle = (c: Chick): void => {
    c.state = "idle";
    c.fp.play(anims.idle);
    c.wait = rnd(1.2, 4);
  };
  const walkTo = (c: Chick, tx: number, ty: number, goal: Chick["goal"]): void => {
    c.tx = tx;
    c.ty = ty;
    c.goal = goal;
    c.state = "walk";
    c.fp.play(anims.walk);
  };
  const lay = (c: Chick): void => {
    c.state = "lay";
    c.fp.play(anims.lay, {
      onFrame: (i) => {
        if (i === LAY_EGG_FRAME) layEgg(c);
      },
      onDone: () => idle(c),
    });
  };
  const sitDown = (c: Chick): void => {
    c.state = "sit";
    c.fp.play(anims.sit, {
      onDone: () => {
        if (night) {
          c.state = "sleep";
          c.fp.play(anims.sleep);
        } else standUp(c);
      },
    });
  };
  const standUp = (c: Chick): void => {
    c.state = "sit";
    c.fp.play(anims.sit, { reverse: true, onDone: () => idle(c) });
  };

  for (let i = 0; i < 3; i++) {
    const spr = new Sprite(anims.idle.frames[0]);
    spr.anchor.set(0.5, 1);
    spr.scale.set(S);
    spr.eventMode = "static";
    spr.cursor = "pointer";
    const c: Chick = {
      spr,
      fp: new FramePlayer(spr),
      x: rnd(40, W - 40),
      y: rnd(FIELD_TOP + 30, H - 30),
      tx: 0,
      ty: 0,
      dir: 1,
      state: "idle",
      goal: "wander",
      wait: 1 + i * 1.3,
      roostX: (W * (i + 1)) / 4,
    };
    spr.on("pointertap", () => {
      if (c.state === "idle" || c.state === "walk") lay(c);
    });
    idle(c);
    c.wait = 1 + i * 1.3;
    app.stage.addChild(spr);
    chicks.push(c);
  }

  // ---- night overlay + toggle chip (overlay must never eat taps)
  const overlay = new Graphics();
  overlay.rect(0, 0, W, H).fill(0x0b1428);
  overlay.alpha = 0;
  overlay.eventMode = "none";
  app.stage.addChild(overlay);

  const chip = new Container();
  const chipBg = new Graphics();
  const chipLabel = new Text({
    text: "NIGHT",
    style: { fontFamily: FONT, fontSize: 13, fill: 0xffffff, stroke: { color: 0x1c2620, width: 3 } },
  });
  chipLabel.anchor.set(0.5);
  const drawChip = (): void => {
    chipBg.clear();
    chipBg.roundRect(0, 0, 84, 32, 8).fill(night ? 0x2b2036 : 0x2f6fdb);
    chipLabel.text = night ? "DAY" : "NIGHT";
    chipLabel.position.set(42, 16);
  };
  drawChip();
  chip.addChild(chipBg, chipLabel);
  chip.position.set(W - 94, 8);
  chip.eventMode = "static";
  chip.cursor = "pointer";
  chip.on("pointertap", () => {
    night = !night;
    drawChip();
    if (!night)
      for (const c of chicks) if (c.state === "sleep") standUp(c);
  });
  app.stage.addChild(chip);

  // ---- the loop
  app.ticker.add((tk) => {
    const dt = Math.min(tk.deltaMS / 1000, 0.1);
    overlay.alpha += ((night ? 0.45 : 0) - overlay.alpha) * Math.min(1, dt * 3);

    for (const c of chicks) {
      c.fp.update(dt);
      if (c.state === "idle") {
        if (night) {
          walkTo(c, c.roostX, roostY + 3, "roost");
          continue;
        }
        c.wait -= dt;
        if (c.wait <= 0) {
          if (Math.random() < 0.35) lay(c);
          else walkTo(c, rnd(30, W - 30), rnd(FIELD_TOP, H - 26), "wander");
        }
      } else if (c.state === "walk") {
        if (night && c.goal !== "roost") walkTo(c, c.roostX, roostY + 3, "roost");
        const dx = c.tx - c.x;
        const dy = c.ty - c.y;
        const dist = Math.hypot(dx, dy);
        const step = WALK_SPD * dt;
        if (dist <= step) {
          c.x = c.tx;
          c.y = c.ty;
          if (c.goal === "roost") {
            if (night) sitDown(c);
            else idle(c);
          } else idle(c);
        } else {
          c.x += (dx / dist) * step;
          c.y += (dy / dist) * step;
          if (Math.abs(dx) > 2) c.dir = dx > 0 ? 1 : -1;
        }
      }
      c.spr.position.set(c.x, c.y);
      c.spr.scale.set(c.dir * S, S);
    }

    for (const e of eggs) {
      if (!e.spr.visible) continue;
      e.age += dt;
      const pop = Math.min(1, e.age / 0.18);
      e.spr.scale.set(S * (0.4 + 0.6 * pop));
      if (e.age > 20) {
        e.spr.alpha = Math.max(0, 1 - (e.age - 20));
        if (e.spr.alpha === 0) e.spr.visible = false;
      }
    }
  });
}

// Egg Empire — browser entry point. Boots Pixi v8, creates the headless sim,
// and wires input/render/audio/UI around it. The sim never sees any of this:
// it gets dt + hooks in, and hands typed events out (drained once per frame).

import { Application, TextureSource, type FederatedPointerEvent } from "pixi.js";
import { audioInit, SFX } from "./audio/sfx";
import { SPECIES } from "./config/species";
import { fmtMoney } from "./config/format";
import {
  buyBird,
  createSim,
  resize,
  sweepCollect,
  tick,
  totalBirds,
  type HeldPointer,
  type SimEvent,
  type SimHooks,
} from "./sim";
import { drawBackground } from "./render/background";
import { createBasketViews } from "./render/baskets";
import { createBirds } from "./render/birds";
import { createCollectorViews } from "./render/collectors";
import { createEggSprites } from "./render/eggs";
import { createLayers } from "./render/layers";
import { createPopups } from "./render/popups";
import { createStartScreen, createWinScreen } from "./render/screens";
import { makeTextures } from "./render/textures";
import { createHud } from "./ui/hud";
import { createTree } from "./ui/tree";

async function boot(): Promise<void> {
  TextureSource.defaultOptions.scaleMode = "nearest";
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

  const sim = createSim({ width: app.screen.width, height: app.screen.height });
  const textures = makeTextures(app.renderer);
  const layers = createLayers(app.stage);
  const birds = createBirds(layers.birds, textures, () => sim.layout);
  const eggSprites = createEggSprites(layers.eggs, textures);
  const basketViews = createBasketViews(layers.baskets, layers.trucks, textures);
  const collectorViews = createCollectorViews(layers.collectors, textures);
  const popups = createPopups(layers.fx);
  const startScreen = createStartScreen(layers.start, textures);
  const winScreen = createWinScreen(layers.win);

  const hud = createHud({
    sim,
    onBuyBird(species) {
      if (buyBird(sim, species)) hud.refresh();
    },
    onToggleTree() {
      if (started) tree.toggle();
    },
  });
  const tree = createTree({ overlay: layers.tree, sim, textures, refreshHud: () => hud.refresh() });

  const hooks: SimHooks = { rng: Math.random, spawnPoint: (i) => birds.spawnPoint(i) };

  let started = false;
  let hinted = false;
  let W = 0;
  let H = 0;
  let hudAcc = 0;
  let cluckT = 2;
  const pointers = new Map<number, { x: number; y: number }>();
  const heldBuf: HeldPointer[] = [];

  function layout(): void {
    W = app.screen.width;
    H = app.screen.height;
    resize(sim, W, H);
    drawBackground(layers.bg, sim.layout);
    basketViews.layout(sim);
    birds.clamp(sim.layout);
    if (startScreen.visible) startScreen.position(sim.layout);
  }

  function startGame(): void {
    started = true;
    startScreen.hide();
    hud.showHint();
  }

  function dispatch(ev: SimEvent): void {
    switch (ev.type) {
      case "egg-laid":
        eggSprites.acquire(ev.egg);
        break;
      case "egg-bounced":
        SFX.land();
        break;
      case "egg-spoiled":
        eggSprites.release(ev.egg.id);
        SFX.spoil();
        break;
      case "egg-despawned":
      case "egg-picked-up":
      case "egg-deposited":
        eggSprites.release(ev.egg.id);
        break;
      case "egg-collected":
        SFX.pop(ev.egg.golden);
        popups.spawn(
          ev.egg.sx,
          ev.egg.sy - 14,
          "+" + fmtMoney(ev.egg.value),
          ev.egg.golden ? 0xffd24a : 0xfff3da,
          ev.egg.golden ? 18 : 13,
        );
        if (!hinted) {
          hinted = true;
          hud.hideHint();
        }
        break;
      case "baskets-full":
        basketViews.wiggleAll();
        popups.spawn(sim.baskets[0].x, sim.layout.basketY - 70, "Baskets full!", 0xff8a8a, 14);
        SFX.donk();
        break;
      case "truck-dispatched":
        SFX.honk();
        break;
      case "payout":
        popups.spawn(ev.basket.x, sim.layout.basketY - 70, "+" + fmtMoney(ev.money), 0x7ef25d, 24);
        popups.spawn(ev.basket.x, sim.layout.basketY - 44, `+${ev.feathers} 🪶`, 0x8fe3d0, 16);
        SFX.kaching();
        hud.refresh();
        break;
      case "node-bought":
      case "bird-bought":
        SFX.buy();
        hud.refresh();
        break;
      case "species-unlocked":
        popups.spawn(W / 2, H * 0.3, `${SPECIES[ev.species].plural} unlocked!`, 0xffd24a, 26);
        SFX.unlock();
        hud.refresh();
        break;
      case "won":
        SFX.win();
        winScreen.show(sim.layout);
        for (let i = 0; i < 20; i++)
          setTimeout(
            () => popups.spawn(Math.random() * W, H * 0.3 + Math.random() * H * 0.4, "🪶", 0x8fe3d0, 22),
            i * 120,
          );
        break;
    }
  }

  // ---- input (prototype routing: start screen → win screen → tree → sweep) ----
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointerdown", (ev: FederatedPointerEvent) => {
    audioInit();
    if (!started) {
      startGame();
      return;
    }
    if (sim.won && winScreen.visible) {
      winScreen.hide();
      return;
    }
    if (tree.isOpen()) {
      tree.onDown(ev);
      return;
    }
    const { x, y } = ev.global;
    pointers.set(ev.pointerId, { x, y });
    sweepCollect(sim, x, y, x, y);
  });
  app.stage.on("pointermove", (ev: FederatedPointerEvent) => {
    if (tree.isOpen()) {
      tree.onMove(ev);
      return;
    }
    const p = pointers.get(ev.pointerId);
    if (!p) return;
    const { x, y } = ev.global;
    // Segment sweep: fast flicks collect everything along the path.
    sweepCollect(sim, p.x, p.y, x, y);
    p.x = x;
    p.y = y;
  });
  const endPointer = (ev: FederatedPointerEvent): void => {
    if (tree.isOpen()) {
      tree.onUp(ev);
      return;
    }
    pointers.delete(ev.pointerId);
  };
  app.stage.on("pointerup", endPointer);
  app.stage.on("pointerupoutside", endPointer);
  app.stage.on("pointercancel", endPointer);

  // ---- main loop: variable-rate render, clamped dt into the sim ----
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS, 100) / 1000;
    if (app.screen.width !== W || app.screen.height !== H) {
      layout();
      if (tree.isOpen()) tree.open(); // re-layout the overlay in place
    }
    const now = performance.now() / 1000;

    if (!started) {
      startScreen.update(now);
      return;
    }

    // ambient clucking, denser with more birds
    cluckT -= dt;
    if (cluckT <= 0) {
      SFX.cluck();
      cluckT = (totalBirds(sim) > 12 ? 1.0 : 2.0) + Math.random() * 2.5;
    }

    heldBuf.length = 0;
    if (!tree.isOpen()) pointers.forEach((p) => heldBuf.push(p)); // hold = per-frame vacuum
    tick(sim, dt, hooks, heldBuf);

    for (const ev of sim.events) dispatch(ev);
    sim.events.length = 0;

    birds.sync(sim);
    basketViews.sync(sim);
    collectorViews.sync(sim);

    eggSprites.update(sim, now, dt);
    basketViews.update(sim, dt);
    collectorViews.update(sim);
    birds.update(now);
    popups.update(dt);

    hudAcc += dt;
    if (hudAcc > 0.25) {
      hud.refresh();
      hudAcc = 0;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) app.ticker.stop();
    else app.ticker.start();
  });

  layout();
  birds.sync(sim);
  basketViews.sync(sim);
  hud.refresh();
  startScreen.position(sim.layout);
}

boot().catch((err) => console.error("Egg Empire failed to boot:", err));

// Egg Empire — browser entry point. Boots Pixi v8, creates the headless sim,
// and wires input/render/audio/UI around it. The sim never sees any of this:
// it gets dt + hooks in, and hands typed events out (drained once per frame).

import { Application, TextureSource, type FederatedPointerEvent } from "pixi.js";
import { audioInit, SFX } from "./audio/sfx";
import { SPECIES } from "./config/species";
import { fmt, fmtMoney } from "./config/format";
import {
  buyBird,
  createSim,
  estimateOfflineIncome,
  resize,
  restore,
  serialize,
  sweepCollect,
  tick,
  totalBirds,
  type HeldPointer,
  type SaveData,
  type SimEvent,
  type SimHooks,
} from "./sim";
import { clearSave, loadSave, writeSave } from "./storage";
import { drawBackground } from "./render/background";
import { createBasketViews } from "./render/baskets";
import { createBirds } from "./render/birds";
import { createCollectorViews } from "./render/collectors";
import { createEggSprites } from "./render/eggs";
import { createLayers } from "./render/layers";
import { createPopups } from "./render/popups";
import { createStartScreen, createWinScreen } from "./render/screens";
import { makeTextures } from "./render/textures";
import { createDevPanel } from "./ui/devpanel";
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

  // Restore a saved game if one exists; credit capped offline income.
  const dims = { width: app.screen.width, height: app.screen.height };
  const saved = loadSave();
  const restored = saved ? restore(saved, dims) : null;
  const sim = restored ?? createSim(dims);
  let offlineMsg: string | null = null;
  if (restored && saved) {
    const off = estimateOfflineIncome(restored, (Date.now() - saved.lastSeen) / 1000);
    if (off.money > 0 || off.feathers > 0) {
      sim.money += off.money;
      sim.feathers += off.feathers;
      offlineMsg = `Welcome back! +${fmtMoney(off.money)} · +${fmt(off.feathers)} 🪶 while away`;
    }
  }
  // State-jumps (era presets, reset) write their target save and reload;
  // persistence must stand down or the pagehide autosave would overwrite
  // the target with the current sim mid-reload.
  let persistEnabled = true;
  const persist = (): void => {
    if (persistEnabled) writeSave(serialize(sim, Date.now()));
  };
  const loadState = (save: SaveData | null): void => {
    persistEnabled = false;
    if (save) writeSave(save);
    else clearSave();
    location.reload();
  };

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
  let saveAcc = 0;
  let cluckT = 2;
  let devSpeed = 1; // ?dev=1 panel can crank this to ×5 (extra ticks per frame)
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
        popups.spawn(ev.basket.x, sim.layout.basketY - 44, `+${fmt(ev.feathers)} 🪶`, 0x8fe3d0, 16);
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
    for (let i = 0; i < devSpeed; i++) tick(sim, dt, hooks, heldBuf);

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
    saveAcc += dt;
    if (saveAcc > 5) {
      persist();
      saveAcc = 0;
    }
  });

  // Pause when backgrounded and save on hide (CLAUDE.md); pagehide catches
  // iOS Safari closing the tab without firing visibilitychange.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      persist();
      app.ticker.stop();
    } else {
      app.ticker.start();
    }
  });
  window.addEventListener("pagehide", persist);
  // Playtest helper: run eggReset() in the console for a fresh farm
  // (the ?dev=1 panel has a reset button wired to the same path).
  (window as { eggReset?: () => void }).eggReset = () => loadState(null);

  layout();
  birds.sync(sim);
  basketViews.sync(sim);
  collectorViews.sync(sim);
  hud.refresh();
  startScreen.position(sim.layout);
  if (offlineMsg) hud.toast(offlineMsg);
  if (new URLSearchParams(location.search).get("dev") === "1") {
    createDevPanel({
      sim,
      refresh: () => hud.refresh(),
      getSpeed: () => devSpeed,
      setSpeed: (x) => {
        devSpeed = x;
      },
      loadState,
    });
  }
}

boot().catch((err) => console.error("Egg Empire failed to boot:", err));

// PWA (README step 7): register the service worker in production builds
// only, so dev/HMR never fights a cache.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

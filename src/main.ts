// Egg Empire — browser entry point. Boots Pixi v8, creates the headless sim,
// and wires input/render/audio/UI around it. The sim never sees any of this:
// it gets dt + hooks in, and hands typed events out (drained once per frame).

import { Application, Graphics, TextureSource, type FederatedPointerEvent } from "pixi.js";
import { audioInit, SFX } from "./audio/sfx";
import { SPECIES } from "./config/species";
import { fmt, fmtMoney } from "./config/format";
import {
  buyBird,
  createSim,
  estimateOfflineIncome,
  hireChef,
  kitchenUnlocked,
  resize,
  restore,
  savedTreeView,
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
import { createKitchenView } from "./render/kitchen";
import { createBasketViews } from "./render/baskets";
import { createBirds } from "./render/birds";
import { createCollectorViews } from "./render/collectors";
import { createEggSprites } from "./render/eggs";
import { createLayers } from "./render/layers";
import { createPopups } from "./render/popups";
import { createStartScreen, createWinScreen } from "./render/screens";
import { makeTextures } from "./render/textures";
import { BAR_H, createBar } from "./ui/bar";
import { createDevPanel } from "./ui/devpanel";
import { createHud } from "./ui/hud";
import { loadPixelFont, safeInsets } from "./ui/kit";
import { createTree } from "./ui/tree";

async function boot(): Promise<void> {
  TextureSource.defaultOptions.scaleMode = "nearest";
  if (new URLSearchParams(location.search).get("gfx") === "1") {
    // Art-reference gallery instead of the game (see src/gfx.ts).
    const { showGallery } = await import("./gfx");
    await showGallery();
    return;
  }
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
  await loadPixelFont(); // before any Text is created — one typeface everywhere

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
      offlineMsg = `Welcome back! +${fmtMoney(off.money)} and +${fmt(off.feathers)} feathers while away`;
    }
  }
  // State-jumps (era presets, reset) write their target save and reload;
  // persistence must stand down or the pagehide autosave would overwrite
  // the target with the current sim mid-reload.
  let persistEnabled = true;
  const persist = (): void => {
    if (persistEnabled) writeSave(serialize(sim, Date.now(), tree.getView()));
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
  // Gold wash over the farm while a rush runs (behind the popups).
  const rushOverlay = new Graphics();
  layers.fx.addChild(rushOverlay);
  const popups = createPopups(layers.fx);
  const startScreen = createStartScreen(layers.start, textures);
  const winScreen = createWinScreen(layers.win, textures);

  const hud = createHud({ sim, layer: layers.uiTop, textures });
  const bar = createBar({
    sim,
    layer: layers.bar,
    textures,
    onBuyBird(species) {
      if (buyBird(sim, species)) refreshAll();
    },
    onToggleTree() {
      if (started) tree.toggle();
    },
    onScreen(next) {
      if (started) setScreen(next);
    },
  });
  const kitchenView = createKitchenView(layers.kitchen, textures, {
    onHireChef(station) {
      if (hireChef(sim, station)) refreshAll();
    },
  });
  const refreshAll = (): void => {
    hud.refresh();
    bar.refresh();
    kitchenView.refresh(sim);
  };
  // Screens are views over the always-running sims (PLAN Phase 5).
  let screen: "farm" | "kitchen" = "farm";
  const farmLayers = [layers.bg, layers.birds, layers.eggs, layers.baskets, layers.collectors, layers.trucks];
  function setScreen(next: "farm" | "kitchen"): void {
    if (next === "kitchen" && !kitchenUnlocked(sim)) return;
    screen = next;
    layers.kitchen.visible = next === "kitchen";
    for (const l of farmLayers) l.visible = next === "farm";
    bar.setScreen(next);
  }
  const tree = createTree({
    overlay: layers.tree,
    sim,
    textures,
    refreshHud: refreshAll,
    initialView: saved ? savedTreeView(saved) : null,
  });

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
    // The farm world stops above the in-canvas bar; the bar owns the rest
    // (including the home-indicator safe area).
    const safe = safeInsets();
    resize(sim, W, H - BAR_H - safe.bottom);
    drawBackground(layers.bg, sim.layout);
    rushOverlay.clear();
    rushOverlay.rect(0, 0, W, sim.layout.h).fill(0xffd24a);
    rushOverlay.alpha = 0;
    basketViews.layout(sim);
    birds.clamp(sim.layout);
    hud.layout();
    bar.layout(W, H, safe.bottom);
    kitchenView.layout(sim);
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
          ev.egg.golden ? 22 : 16,
        );
        if (!hinted) {
          hinted = true;
          hud.hideHint();
        }
        break;
      case "baskets-full":
        basketViews.wiggleAll();
        if (screen === "farm")
          popups.spawn(sim.baskets[0].x, sim.layout.basketY - 70, "Baskets full!", 0xff8a8a, 15);
        SFX.donk();
        break;
      case "truck-dispatched":
        SFX.honk();
        break;
      case "payout":
        // farm popups stay on the farm — the kitchen screen has its own
        if (screen === "farm") {
          popups.spawn(ev.basket.x, sim.layout.basketY - 70, "+" + fmtMoney(ev.money), 0x7ef25d, 24);
          popups.spawn(ev.basket.x, sim.layout.basketY - 44, `+${fmt(ev.feathers)}`, 0x8fe3d0, 17, textures.icons.feather);
          if (ev.routed > 0)
            popups.spawn(ev.basket.x, sim.layout.basketY - 96, `→ ${ev.routed}`, 0xf2cf5d, 15, textures.pan);
        }
        SFX.kaching();
        refreshAll();
        break;
      case "node-bought":
      case "bird-bought":
        SFX.buy();
        refreshAll();
        break;
      case "species-unlocked":
        popups.spawn(W / 2, H * 0.3, `${SPECIES[ev.species].plural} unlocked!`, 0xffd24a, 26);
        SFX.unlock();
        refreshAll();
        break;
      case "kitchen-truck-dispatched":
        SFX.honk();
        break;
      case "kitchen-payout": {
        SFX.kachingUp();
        const stopX = sim.layout.w - 52;
        if (screen === "kitchen") {
          popups.spawn(stopX, sim.layout.roadY - 60, "+" + fmtMoney(ev.money), 0x7ef25d, 22);
          popups.spawn(stopX, sim.layout.roadY - 36, `+${fmt(ev.feathers)}`, 0x8fe3d0, 16, textures.icons.feather);
        }
        refreshAll();
        break;
      }
      case "chef-hired":
        SFX.buy();
        refreshAll();
        break;
      case "dish-cooked": {
        SFX.ding();
        if (screen === "kitchen") {
          const pos = kitchenView.stationPos(ev.dish.station);
          popups.spawn(pos.x, pos.y - 10, "+" + fmtMoney(ev.dish.value), ev.dish.golden ? 0xffd24a : 0xfff3da, 12);
        }
        break;
      }
      case "rush-started":
        eggSprites.release(ev.egg.id); // the shimmer egg is consumed, not collected
        SFX.rush();
        popups.spawn(W / 2, sim.layout.h * 0.33, "GOLDEN RUSH!", 0xffd24a, 22, textures.icons.star);
        break;
      case "rush-ended":
        break;
      case "won":
        SFX.win();
        winScreen.show(sim.layout);
        for (let i = 0; i < 20; i++)
          setTimeout(
            () => popups.spawn(Math.random() * W, H * 0.3 + Math.random() * H * 0.4, "", 0x8fe3d0, 22, textures.icons.feather),
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
    if (screen !== "farm") return; // kitchen taps are buttons only
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
    if (!p || screen !== "farm") return;
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
    hud.update(dt); // hint/toast fades run on every screen

    if (!started) {
      startScreen.update(now, dt, sim.layout);
      return;
    }

    // ambient clucking, denser with more birds
    cluckT -= dt;
    if (cluckT <= 0) {
      SFX.cluck();
      cluckT = (totalBirds(sim) > 12 ? 1.0 : 2.0) + Math.random() * 2.5;
    }

    heldBuf.length = 0;
    if (!tree.isOpen() && screen === "farm") pointers.forEach((p) => heldBuf.push(p)); // hold = per-frame vacuum
    for (let i = 0; i < devSpeed; i++) tick(sim, dt, hooks, heldBuf);

    for (const ev of sim.events) dispatch(ev);
    sim.events.length = 0;

    birds.sync(sim);
    basketViews.sync(sim);
    collectorViews.sync(sim);

    if (screen === "kitchen") {
      kitchenView.update(sim, now);
      if (sim.kitchen.cooking.length > 0) SFX.sizzle();
    }
    rushOverlay.alpha = sim.rush.active > 0 && screen === "farm" ? 0.06 + 0.03 * Math.sin(now * 8) : 0;

    eggSprites.update(sim, now, dt);
    basketViews.update(sim, dt);
    collectorViews.update(sim);
    birds.update(now);
    popups.update(dt);

    hudAcc += dt;
    if (hudAcc > 0.25) {
      refreshAll();
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
  refreshAll();
  startScreen.position(sim.layout);
  if (offlineMsg) hud.toast(offlineMsg);
  if (new URLSearchParams(location.search).get("dev") === "1") {
    createDevPanel({
      sim,
      refresh: () => refreshAll(),
      getSpeed: () => devSpeed,
      setSpeed: (x) => {
        devSpeed = x;
      },
      loadState,
      getStats: () => ({
        fps: Math.round(app.ticker.FPS),
        eggs: sim.ground.length + sim.falling.length + sim.flying.length,
      }),
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

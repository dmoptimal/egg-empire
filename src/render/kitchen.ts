// The Kitchen screen (PLAN.md Phase 5). Same visual grammar as the farm:
// pixel panels via the UI kit, pooled dish sprites (pool = max counter cap,
// per the working rules), chefs animating at their pans, and the kitchen
// truck on its own road. Pure view — all state comes from sim.kitchen.

import { BitmapText, Container, Graphics, Sprite, Text } from "pixi.js";
import { COUNTER_BASE_CAP, COUNTER_CAP_PER_LVL, STATIONS } from "../config/kitchen";
import { fmtMoney } from "../config/format";
import { nodeById } from "../config/nodes";
import {
  chefCost,
  chefSlots,
  cookTime,
  counterCap,
  pantryCap,
  stationUnlocked,
  type SimState,
} from "../sim";
import { FONT, HOT_FONT, pixelButton, pixelPanel, type PixelButton } from "../ui/kit";
import type { Textures } from "./textures";

const STATION_W = 72;
const STATION_H = 112;
const STATION_GAP = 4;

interface StationView {
  root: Container;
  panel: Graphics;
  pan: Sprite;
  progress: Graphics;
  chefs: Sprite[];
  hire: PixelButton;
  hireLabel: BitmapText;
}

export interface KitchenView {
  layout(sim: SimState): void;
  refresh(sim: SimState): void;
  update(sim: SimState, now: number): void;
  /** Screen position of a station's pan — dish popups spawn here. */
  stationPos(station: number): { x: number; y: number };
}

export interface KitchenDeps {
  onHireChef(station: number): void;
}

export function createKitchenView(
  root: Container,
  textures: Textures,
  deps: KitchenDeps,
): KitchenView {
  const bg = new Graphics();
  root.addChild(bg);

  // pantry ------------------------------------------------------------------
  const crate = new Sprite(textures.crate);
  crate.scale.set(3.5);
  crate.position.set(14, 78);
  const pantryText = new BitmapText({ text: "0/30", style: { fontFamily: HOT_FONT, fontSize: 13 } });
  pantryText.tint = 0xfff3da;
  pantryText.position.set(74, 92);
  const pantryLabel = new Text({
    text: "Pantry",
    style: { fontFamily: FONT, fontSize: 12, fontWeight: "700", fill: "#e8dcc8" },
  });
  pantryLabel.position.set(74, 74);
  root.addChild(crate, pantryText, pantryLabel);

  // stations ----------------------------------------------------------------
  const stationsRow = new Container();
  stationsRow.y = 150;
  root.addChild(stationsRow);
  const stations: StationView[] = STATIONS.map((def, i) => {
    const sroot = new Container();
    sroot.x = 8 + i * (STATION_W + STATION_GAP);
    const panel = new Graphics();
    pixelPanel(panel, 0, 0, STATION_W, STATION_H, { face: 0x6a5a48, frame: 0x3a3028 });
    const name = new Text({
      text: def.name,
      style: { fontFamily: FONT, fontSize: 9, fontWeight: "700", fill: "#f5ead8" },
    });
    name.anchor.set(0.5, 0);
    name.position.set(STATION_W / 2, 6);
    const pan = new Sprite(textures.pan);
    pan.anchor.set(0.5);
    pan.scale.set(2.4);
    pan.position.set(STATION_W / 2, 34);
    const progress = new Graphics();
    const chefs: Sprite[] = [];
    for (let c = 0; c < 4; c++) {
      const chef = new Sprite(textures.chef);
      chef.anchor.set(0.5, 1);
      chef.scale.set(1.5);
      chef.position.set(14 + c * 15, 82);
      chef.visible = false;
      sroot.addChild(chef);
      chefs.push(chef);
    }
    const hireLabel = new BitmapText({
      text: "",
      style: { fontFamily: HOT_FONT, fontSize: 8 },
    });
    hireLabel.anchor.set(0.5);
    const hire = pixelButton({
      w: STATION_W - 8,
      h: 22,
      face: 0x2f9d5c,
      content: hireLabel,
      onTap: () => deps.onHireChef(i),
    });
    hire.root.position.set(4, STATION_H - 26);
    sroot.addChild(panel, name, pan, progress, hire.root);
    sroot.visible = false;
    stationsRow.addChild(sroot);
    return { root: sroot, panel, pan, progress, chefs, hire, hireLabel };
  });

  // counter rail --------------------------------------------------------------
  const railPanel = new Graphics();
  const railLabel = new Text({
    text: "Counter",
    style: { fontFamily: FONT, fontSize: 12, fontWeight: "700", fill: "#e8dcc8" },
  });
  const railCount = new BitmapText({ text: "0/20", style: { fontFamily: HOT_FONT, fontSize: 12 } });
  railCount.tint = 0xfff3da;
  const railDishes = new Container();
  root.addChild(railPanel, railLabel, railCount, railDishes);
  // Pool = the largest counter cap ever possible (Phase 6 "Long counter"
  // maxes at 3 levels; fall back to that shape until the node exists).
  const MAX_COUNTER = COUNTER_BASE_CAP + COUNTER_CAP_PER_LVL * (nodeById.counter ? nodeById.counter.max : 3);
  const dishPool: Sprite[] = [];
  for (let i = 0; i < MAX_COUNTER; i++) {
    const d = new Sprite(textures.dish[0]);
    d.scale.set(2.2);
    d.visible = false;
    railDishes.addChild(d);
    dishPool.push(d);
  }

  // kitchen truck --------------------------------------------------------------
  const truck = new Sprite(textures.truck);
  truck.anchor.set(0.5, 1);
  truck.scale.set(3);
  root.addChild(truck);

  let railY = 300;
  let lastPantry = -1;
  let lastCounter = -1;

  return {
    layout(sim: SimState): void {
      const { w: W, h: H, roadY } = sim.layout;
      bg.clear();
      bg.rect(0, 0, W, 150).fill(0x5a4a3c); // wall
      bg.rect(0, 150, W, roadY - 12 - 150).fill(0x8a7a68); // floor
      for (let y = 150; y < roadY - 12; y += 44)
        for (let x = ((y / 44) % 2) * 22; x < W; x += 44) bg.rect(x, y, 22, 22);
      bg.fill(0x7e6e5c);
      bg.rect(0, roadY - 12, W, 26).fill(0x565656);
      for (let x = 8; x < W; x += 52) bg.rect(x, roadY, 20, 3);
      bg.fill(0xdddddd);
      bg.rect(0, roadY + 14, W, H - roadY - 14).fill(0x4a7c2f);

      railY = 290;
      railPanel.clear();
      pixelPanel(railPanel, 8, railY, W - 16, 130, { face: 0x6a5a48, frame: 0x3a3028 });
      railLabel.position.set(20, railY + 8);
      railCount.position.set(88, railY + 6);
      railDishes.position.set(20, railY + 32);
      truck.y = roadY - 10;
      lastCounter = -1; // force rail re-sync after a relayout
      lastPantry = -1;
    },
    refresh(sim: SimState): void {
      for (let i = 0; i < STATIONS.length; i++) {
        const v = stations[i];
        const on = stationUnlocked(sim, i);
        v.root.visible = on;
        if (!on) continue;
        const hired = sim.kitchen.chefs[i];
        const slots = chefSlots(sim, i);
        v.chefs.forEach((c, ci) => (c.visible = ci < hired));
        if (hired >= slots) {
          v.hireLabel.text = `${hired}/${slots}`;
          v.hire.setDisabled(true);
        } else {
          v.hireLabel.text = `+${fmtMoney(chefCost(sim, i))}`;
          v.hire.setDisabled(sim.money < chefCost(sim, i));
        }
      }
    },
    update(sim: SimState, now: number): void {
      const k = sim.kitchen;
      if (k.pantry.length !== lastPantry) {
        lastPantry = k.pantry.length;
        pantryText.text = `${k.pantry.length}/${pantryCap(sim)}`;
      }
      // stations: pan bob + progress of the soonest-done job
      for (let i = 0; i < STATIONS.length; i++) {
        const v = stations[i];
        if (!v.root.visible) continue;
        let best: number | null = null;
        for (const job of k.cooking)
          if (job.station === i && (best === null || job.t < best)) best = job.t;
        v.progress.clear();
        if (best !== null) {
          const frac = 1 - best / cookTime(sim, i);
          v.progress.rect(8, 50, (STATION_W - 16) * Math.max(0, Math.min(1, frac)), 4).fill(0x7ef25d);
          v.pan.y = 34 + Math.sin(now * 10 + i) * 1.5;
        } else {
          v.pan.y = 34;
        }
      }
      // counter rail
      if (k.counter.length !== lastCounter) {
        lastCounter = k.counter.length;
        railCount.text = `${k.counter.length}/${counterCap(sim)}`;
        for (let i = 0; i < dishPool.length; i++) {
          const d = dishPool[i];
          if (i < k.counter.length) {
            d.texture = textures.dish[k.counter[i].station];
            d.tint = k.counter[i].golden ? 0xffd24a : 0xffffff;
            d.position.set((i % 13) * 27, Math.floor(i / 13) * 22);
            d.visible = true;
          } else {
            d.visible = false;
          }
        }
      }
      truck.x = k.truck.truckX;
    },
    stationPos(station: number): { x: number; y: number } {
      return { x: 8 + station * (STATION_W + STATION_GAP) + STATION_W / 2, y: 150 + 30 };
    },
  };
}

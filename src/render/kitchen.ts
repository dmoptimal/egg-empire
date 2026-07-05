// The Kitchen screen (PLAN.md Phase 5 + Dan's customer overhaul). Same visual
// grammar as the farm: pixel panels via the UI kit, pooled sprites, chefs
// animating at their pans — plus walk-in customers with ticket bubbles, chef
// runners ferrying dishes to the counter/delivery sections, and the Dinner
// Rush frenzy. Pure view — all state comes from sim.kitchen.
//
// Hit-testing rule (learned the hard way): every decorative child here gets
// eventMode "none" so it can never swallow taps meant for buttons/customers.

import { BitmapText, Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { CUSTOMER_PATIENCE, PLATE_WINDOW, STATIONS, VIP_PATIENCE } from "../config/kitchen";
import { fmtMoney } from "../config/format";
import {
  canServeCustomer,
  chefCost,
  chefSlots,
  cookTime,
  counterCap,
  pantryCap,
  stationUnlocked,
  type Customer,
  type SimState,
} from "../sim";
import { attachTap, FONT, HOT_FONT, pixelButton, pixelPanel, type PixelButton } from "../ui/kit";
import type { Textures } from "./textures";

const STATION_W = 72;
const STATION_H = 112;
const STATION_GAP = 4;
const CHEF_VIEW_CAP = 4; //   sprites per station regardless of slots (view rule)
const DISH_SHOW_COUNTER = 24; // dish minis drawn before the count text takes over
const DISH_SHOW_DELIVERY = 16;
const CUSTOMER_POOL = 8; //   3 queue spots + everyone mid-walk
const RUNNER_SPEED = 190; //  px/s chef jog to the counter and back

interface StationView {
  root: Container;
  panel: Graphics;
  pan: Sprite;
  progress: Graphics;
  hire: PixelButton;
  hireLabel: BitmapText;
}

type RunnerMode = "post" | "go" | "back";

interface ChefView {
  root: Container;
  carry: Sprite;
  station: number;
  /** Standing spot in front of the pans. */
  px: number;
  py: number;
  mode: RunnerMode;
  tx: number;
  ty: number;
}

interface CustomerView {
  root: Container;
  body: Sprite;
  bubble: Container;
  bubbleGfx: Graphics;
  icons: Sprite[];
  counts: BitmapText[];
  vipTxt: BitmapText;
  bar: Graphics;
  id: number;
  lastFace: string;
  /** Current bubble panel width — update() clamps it onto the screen. */
  bubbleW: number;
}

export interface KitchenView {
  layout(sim: SimState): void;
  refresh(sim: SimState): void;
  update(sim: SimState, now: number, dt: number): void;
  /** Screen position of a station's pan — dish popups spawn here. */
  stationPos(station: number): { x: number; y: number };
  /** Feet line of the customer lane — serve popups spawn above it. */
  laneY(): number;
  /** Send a chef jogging with a fresh dish to its section (visual only). */
  onDishCooked(station: number, target: "counter" | "delivery"): void;
}

export interface KitchenDeps {
  onHireChef(station: number): void;
  onPlate(station: number): void;
  onServe(customerId: number): void;
}

export function createKitchenView(
  root: Container,
  textures: Textures,
  deps: KitchenDeps,
): KitchenView {
  const quiet = (c: Container): void => {
    c.eventMode = "none";
    c.interactiveChildren = false;
  };

  const bg = new Graphics();
  quiet(bg);
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
  quiet(crate);
  quiet(pantryLabel);
  quiet(pantryText);
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
    quiet(panel);
    const name = new Text({
      text: def.name,
      style: { fontFamily: FONT, fontSize: 9, fontWeight: "700", fill: "#f5ead8" },
    });
    name.anchor.set(0.5, 0);
    name.position.set(STATION_W / 2, 6);
    quiet(name);
    const pan = new Sprite(textures.pan);
    pan.anchor.set(0.5);
    pan.scale.set(2.4);
    pan.position.set(STATION_W / 2, 34);
    quiet(pan);
    const progress = new Graphics();
    quiet(progress);
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
    // Tap the pan area to Perfect-plate a sizzling dish (fun pass #3).
    const plateHit = new Graphics();
    plateHit.rect(0, 0, STATION_W, STATION_H - 30).fill({ color: 0xffffff, alpha: 0.001 });
    sroot.addChildAt(plateHit, 1);
    attachTap(plateHit, { onTap: () => deps.onPlate(i) });
    sroot.visible = false;
    stationsRow.addChild(sroot);
    return { root: sroot, panel, pan, progress, hire, hireLabel };
  });

  // chefs — one sprite per hire, standing at the pans, jogging dishes over.
  // (Added to the tree AFTER the section panels so runners jog in FRONT of
  // the counter instead of vanishing behind it.)
  const chefLayer = new Container();
  quiet(chefLayer);
  const chefs: ChefView[] = [];
  for (let si = 0; si < STATIONS.length; si++) {
    for (let ci = 0; ci < CHEF_VIEW_CAP; ci++) {
      const croot = new Container();
      const body = new Sprite(textures.chef);
      body.anchor.set(0.5, 1);
      body.scale.set(1.5);
      const carry = new Sprite(textures.dish[si]);
      carry.anchor.set(0.5);
      carry.scale.set(1.6);
      carry.y = -24;
      carry.visible = false;
      croot.addChild(body, carry);
      const px = 8 + si * (STATION_W + STATION_GAP) + 14 + ci * 15;
      const py = 150 + 82;
      croot.position.set(px, py);
      croot.visible = false;
      chefLayer.addChild(croot);
      chefs.push({ root: croot, carry, station: si, px, py, mode: "post", tx: px, ty: py });
    }
  }

  // counter (customers) + delivery shelf (truck) -----------------------------
  const counterPanel = new Graphics();
  const counterLabel = new Text({
    text: "Counter",
    style: { fontFamily: FONT, fontSize: 12, fontWeight: "700", fill: "#e8dcc8" },
  });
  const counterCount = new BitmapText({ text: "0/20", style: { fontFamily: HOT_FONT, fontSize: 11 } });
  counterCount.tint = 0xfff3da;
  const counterDishes = new Container();
  const deliveryPanel = new Graphics();
  const deliveryLabel = new Text({
    text: "Delivery",
    style: { fontFamily: FONT, fontSize: 12, fontWeight: "700", fill: "#e8dcc8" },
  });
  const deliveryCount = new BitmapText({ text: "0/20", style: { fontFamily: HOT_FONT, fontSize: 11 } });
  deliveryCount.tint = 0xfff3da;
  const deliveryDishes = new Container();
  for (const c of [counterPanel, counterLabel, counterCount, counterDishes, deliveryPanel, deliveryLabel, deliveryCount, deliveryDishes])
    quiet(c);
  root.addChild(counterPanel, counterLabel, counterCount, counterDishes, deliveryPanel, deliveryLabel, deliveryCount, deliveryDishes, chefLayer);
  const counterPool: Sprite[] = [];
  const deliveryPool: Sprite[] = [];
  for (let i = 0; i < DISH_SHOW_COUNTER; i++) {
    const d = new Sprite(textures.dish[0]);
    d.scale.set(1.7);
    d.visible = false;
    counterDishes.addChild(d);
    counterPool.push(d);
  }
  for (let i = 0; i < DISH_SHOW_DELIVERY; i++) {
    const d = new Sprite(textures.dish[0]);
    d.scale.set(1.7);
    d.visible = false;
    deliveryDishes.addChild(d);
    deliveryPool.push(d);
  }

  // customers -----------------------------------------------------------------
  const customerLayer = new Container();
  root.addChild(customerLayer);
  const customers: CustomerView[] = [];
  for (let i = 0; i < CUSTOMER_POOL; i++) {
    const croot = new Container();
    const body = new Sprite(textures.customer[0]);
    body.anchor.set(0.5, 1);
    body.scale.set(3);
    const bubble = new Container();
    bubble.y = -66;
    const bubbleGfx = new Graphics();
    bubble.addChild(bubbleGfx);
    const icons: Sprite[] = [];
    const counts: BitmapText[] = [];
    for (let d = 0; d < 3; d++) {
      const ic = new Sprite(textures.dish[0]);
      ic.scale.set(1.5);
      ic.visible = false;
      const ct = new BitmapText({ text: "", style: { fontFamily: HOT_FONT, fontSize: 8 } });
      ct.tint = 0xfff3da;
      ct.visible = false;
      bubble.addChild(ic, ct);
      icons.push(ic);
      counts.push(ct);
    }
    const vipTxt = new BitmapText({ text: "VIP!", style: { fontFamily: HOT_FONT, fontSize: 10 } });
    vipTxt.tint = 0xffd24a;
    vipTxt.visible = false;
    bubble.addChild(vipTxt);
    const bar = new Graphics();
    bubble.addChild(bar);
    croot.addChild(body, bubble);
    croot.visible = false;
    croot.hitArea = new Rectangle(-34, -104, 68, 110);
    attachTap(croot, { onTap: () => deps.onServe(view.id) });
    customerLayer.addChild(croot);
    const view: CustomerView = {
      root: croot,
      body,
      bubble,
      bubbleGfx,
      icons,
      counts,
      vipTxt,
      bar,
      id: -1,
      lastFace: "",
      bubbleW: 40,
    };
    customers.push(view);
  }

  /** Panel + contents for one customer's ticket bubble (green = tap me). */
  function drawBubble(v: CustomerView, c: Customer, servable: boolean): void {
    const face = c.vip ? "vip" : servable ? "go" : "wait";
    if (face === v.lastFace) return;
    v.lastFace = face;
    const kinds: number[] = [];
    for (let st = 0; st < c.needs.length; st++) if (c.needs[st] > 0) kinds.push(st);
    const w = c.vip ? 56 : Math.max(40, 10 + kinds.length * 34);
    v.bubbleW = w;
    v.bubbleGfx.clear();
    pixelPanel(v.bubbleGfx, -w / 2, 0, w, 30, {
      face: c.vip ? 0x6a5218 : servable ? 0x2f6a3c : 0x4a4438,
      frame: c.vip ? 0xffd24a : servable ? 0x7ef25d : 0x2a261e,
    });
    for (let d = 0; d < 3; d++) {
      const st = kinds[d];
      if (st === undefined || c.vip) {
        v.icons[d].visible = false;
        v.counts[d].visible = false;
        continue;
      }
      v.icons[d].texture = textures.dish[st];
      v.icons[d].position.set(-w / 2 + 7 + d * 34, 7);
      v.icons[d].visible = true;
      v.counts[d].text = `×${c.needs[st]}`;
      v.counts[d].position.set(-w / 2 + 24 + d * 34, 10);
      v.counts[d].visible = true;
    }
    v.vipTxt.visible = c.vip;
    v.vipTxt.position.set(-18, 10);
  }

  // kitchen truck --------------------------------------------------------------
  const truck = new Sprite(textures.truck);
  truck.anchor.set(0.5, 1);
  truck.scale.set(3);
  quiet(truck);
  root.addChild(truck);

  // Dinner Rush dressing: a warm wash + pulsing banner while the frenzy runs.
  const krushOverlay = new Graphics();
  quiet(krushOverlay);
  const krushBanner = new BitmapText({ text: "DINNER RUSH!", style: { fontFamily: HOT_FONT, fontSize: 15 } });
  krushBanner.tint = 0xff9a3d;
  krushBanner.anchor.set(0.5);
  krushBanner.visible = false;
  quiet(krushBanner);
  root.addChild(krushOverlay, krushBanner);

  let railY = 290;
  let laneYv = 420;
  let screenW = 390;
  let counterX = 8;
  let counterW = 220;
  let deliveryX = 240;
  let deliveryW = 140;
  let lastPantry = -1;
  let lastCounter = -1;
  let lastDelivery = -1;
  let dropSeq = 0;

  const syncDishes = (dishes: { station: number; golden: boolean }[], pool: Sprite[], w: number): void => {
    const perRow = Math.max(1, Math.floor((w - 24) / 21));
    for (let i = 0; i < pool.length; i++) {
      const d = pool[i];
      if (i < dishes.length && Math.floor(i / perRow) < 2) {
        d.texture = textures.dish[dishes[i].station];
        d.tint = dishes[i].golden ? 0xffd24a : 0xffffff;
        d.position.set(12 + (i % perRow) * 21, (Math.floor(i / perRow) % 2) * 21);
        d.visible = true;
      } else {
        d.visible = false;
      }
    }
  };

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
      screenW = W;
      counterX = 8;
      counterW = Math.floor((W - 24) * 0.58);
      deliveryX = counterX + counterW + 8;
      deliveryW = W - 16 - counterW - 8;
      laneYv = Math.min(railY + 86 + 56, roadY - 22);
      counterPanel.clear();
      pixelPanel(counterPanel, counterX, railY, counterW, 86, { face: 0x6a5a48, frame: 0x3a3028 });
      counterLabel.position.set(counterX + 12, railY + 6);
      counterCount.position.set(counterX + 76, railY + 8);
      counterDishes.position.set(counterX, railY + 32);
      deliveryPanel.clear();
      pixelPanel(deliveryPanel, deliveryX, railY, deliveryW, 86, { face: 0x5a5248, frame: 0x322e28 });
      deliveryLabel.position.set(deliveryX + 12, railY + 6);
      deliveryCount.position.set(deliveryX + 82, railY + 8);
      deliveryDishes.position.set(deliveryX, railY + 32);
      krushOverlay.clear();
      krushOverlay.rect(0, 0, W, H).fill(0xff9a3d);
      krushOverlay.alpha = 0;
      krushBanner.position.set(W / 2, 136);
      truck.y = roadY - 10;
      lastCounter = -1; // force re-sync after a relayout
      lastDelivery = -1;
      lastPantry = -1;
    },
    refresh(sim: SimState): void {
      for (let i = 0; i < STATIONS.length; i++) {
        const v = stations[i];
        const on = stationUnlocked(sim, i);
        v.root.visible = on;
        const hired = sim.kitchen.chefs[i];
        for (let ci = 0; ci < CHEF_VIEW_CAP; ci++)
          chefs[i * CHEF_VIEW_CAP + ci].root.visible = on && ci < hired;
        if (!on) continue;
        const slots = chefSlots(sim, i);
        if (hired >= slots) {
          v.hireLabel.text = `${hired}/${slots}`;
          v.hire.setDisabled(true);
        } else {
          v.hireLabel.text = `+${fmtMoney(chefCost(sim, i))}`;
          v.hire.setDisabled(sim.money < chefCost(sim, i));
        }
      }
    },
    update(sim: SimState, now: number, dt: number): void {
      const k = sim.kitchen;
      if (k.pantry.length !== lastPantry) {
        lastPantry = k.pantry.length;
        pantryText.text = `${k.pantry.length}/${pantryCap(sim)}`;
      }
      // stations: pan bob + progress; READY pans flash gold and beg a tap
      for (let i = 0; i < STATIONS.length; i++) {
        const v = stations[i];
        if (!v.root.visible) continue;
        let best: number | null = null;
        for (const job of k.cooking)
          if (job.station === i && (best === null || job.t < best)) best = job.t;
        v.progress.clear();
        if (best !== null && best <= 0) {
          // sizzling: window bar drains gold, pan jumps and flashes
          const left = Math.max(0, 1 + best / PLATE_WINDOW);
          v.progress.rect(8, 50, (STATION_W - 16) * left, 4).fill(0xffd24a);
          v.pan.y = 32 + Math.sin(now * 22 + i) * 3;
          v.pan.tint = (Math.sin(now * 14) > 0 ? 0xffd24a : 0xffffff);
        } else if (best !== null) {
          const frac = 1 - best / cookTime(sim, i);
          v.progress.rect(8, 50, (STATION_W - 16) * Math.max(0, Math.min(1, frac)), 4).fill(0x7ef25d);
          v.pan.y = 34 + Math.sin(now * (k.krush.active > 0 ? 20 : 10) + i) * 1.5;
          v.pan.tint = 0xffffff;
        } else {
          v.pan.y = 34;
          v.pan.tint = 0xffffff;
        }
      }
      // chef runners: post → target section → back to the pans
      for (const c of chefs) {
        if (!c.root.visible || c.mode === "post") continue;
        const speed = RUNNER_SPEED * (k.krush.active > 0 ? 1.5 : 1);
        const dx = c.tx - c.root.x;
        const dy = c.ty - c.root.y;
        const dist = Math.hypot(dx, dy);
        const step = speed * dt;
        c.root.scale.x = dx < -1 ? -1 : 1;
        if (dist <= step) {
          c.root.position.set(c.tx, c.ty);
          if (c.mode === "go") {
            c.carry.visible = false;
            c.mode = "back";
            c.tx = c.px;
            c.ty = c.py;
          } else {
            c.mode = "post";
            c.root.scale.x = 1;
          }
        } else {
          c.root.x += (dx / dist) * step;
          c.root.y += (dy / dist) * step;
        }
      }
      // customers: acquire/release by id, walk/wait/wobble, bubbles
      // (index loops, not find() — no closure allocation in the render loop)
      for (let vi = 0; vi < customers.length; vi++) {
        const v = customers[vi];
        if (v.id === -1) continue;
        let alive = false;
        for (let ci = 0; ci < k.customers.length; ci++)
          if (k.customers[ci].id === v.id) {
            alive = true;
            break;
          }
        if (!alive) {
          v.id = -1;
          v.root.visible = false;
        }
      }
      for (let ci = 0; ci < k.customers.length; ci++) {
        const c = k.customers[ci];
        let v: CustomerView | null = null;
        for (let vi = 0; vi < customers.length; vi++)
          if (customers[vi].id === c.id) {
            v = customers[vi];
            break;
          }
        if (!v) {
          for (let vi = 0; vi < customers.length; vi++)
            if (customers[vi].id === -1) {
              v = customers[vi];
              break;
            }
          if (!v) continue; // pool exhausted — sim keeps counting, view skips
          v.id = c.id;
          v.body.texture = c.vip ? textures.vip : textures.customer[c.look];
          v.lastFace = "";
          v.root.visible = true;
        }
        const fret = c.state === "wait" && c.patience < 6;
        v.root.x = c.x + (fret ? Math.sin(now * 26) * 1.5 : 0);
        v.root.y = laneYv;
        v.body.scale.x = (c.state === "leave" ? -1 : 1) * 3;
        v.bubble.visible = c.state !== "leave";
        if (c.state !== "leave") {
          drawBubble(v, c, c.state === "wait" && (c.vip || canServeCustomer(sim, c)));
          // Keep the ticket on screen even while its owner walks in from
          // off-stage — slide it along the edge instead of clipping.
          const lo = 6 + v.bubbleW / 2 - c.x;
          const hi = screenW - 6 - v.bubbleW / 2 - c.x;
          v.bubble.x = lo > 0 ? lo : hi < 0 ? hi : 0;
          v.bar.clear();
          if (c.state === "wait") {
            const frac = Math.max(0, c.patience / (c.vip ? VIP_PATIENCE : CUSTOMER_PATIENCE));
            v.bar.rect(-16, 32, 32 * frac, 3).fill(frac < 0.3 ? 0xff8a8a : 0x8fe3d0);
          }
        }
      }
      // section stacks
      if (k.counter.length !== lastCounter) {
        lastCounter = k.counter.length;
        counterCount.text = `${k.counter.length}/${counterCap(sim)}`;
        syncDishes(k.counter, counterPool, counterW);
      }
      if (k.delivery.length !== lastDelivery) {
        lastDelivery = k.delivery.length;
        deliveryCount.text = `${k.delivery.length}/${counterCap(sim)}`;
        syncDishes(k.delivery, deliveryPool, deliveryW);
      }
      // Dinner Rush dressing
      if (k.krush.active > 0) {
        krushOverlay.alpha = 0.05 + 0.03 * Math.sin(now * 9);
        krushBanner.visible = true;
        krushBanner.text = `DINNER RUSH ${Math.ceil(k.krush.active)}s`;
        krushBanner.scale.set(1 + 0.06 * Math.sin(now * 10));
      } else {
        krushOverlay.alpha = 0;
        krushBanner.visible = false;
      }
      truck.x = k.truck.truckX;
    },
    stationPos(station: number): { x: number; y: number } {
      return { x: 8 + station * (STATION_W + STATION_GAP) + STATION_W / 2, y: 150 + 30 };
    },
    laneY(): number {
      return laneYv;
    },
    onDishCooked(station: number, target: "counter" | "delivery"): void {
      const free = chefs.find((c) => c.station === station && c.root.visible && c.mode === "post");
      if (!free) return; // every hand is mid-run — the stack still updates
      free.mode = "go";
      free.carry.texture = textures.dish[station];
      free.carry.visible = true;
      dropSeq++;
      if (target === "counter") {
        free.tx = counterX + 24 + (dropSeq % 5) * Math.max(24, (counterW - 48) / 4);
        free.ty = railY + 72; // stands AT the counter face (runners render in front)
      } else {
        free.tx = deliveryX + 20 + (dropSeq % 3) * Math.max(20, (deliveryW - 40) / 2);
        free.ty = railY + 72;
      }
    },
  };
}

// Skill tree overlay — PLAN.md Phase 2 engine. Nodes live at free
// design-space coordinates; the camera pans on both axes (clamped to the
// node extents) and pinch-zooms 0.4×–1.5× anchored on the pinch midpoint.
// Buying is select-then-tap: first tap selects a node and shows a pixel
// popover beside it (auto-flipping, never off-screen, never covering the
// node); a second tap on the node or the popover buys. Panning never buys,
// and a second finger (pinch) cancels any pending tap. The camera persists
// in the save; the first-ever open centres the root.

import {
  Container,
  Graphics,
  Sprite,
  Text,
  type FederatedPointerEvent,
  type TextStyleOptions,
} from "pixi.js";
import { fmt, fmtMoney } from "../config/format";
import { edgePath, NODES, nodeById, type NodeDef } from "../config/nodes";
import {
  birdCost,
  buyBird,
  buyNode,
  canAfford,
  lvl,
  nodeCost,
  nodeState,
  type SimState,
  type TreeView,
} from "../sim";
import type { Textures } from "../render/textures";
import { FONT, pixelPanel } from "./kit";

const NODE_R = 24;
const HIT_R = 34;
const MARGIN = 60; // camera slack around the node extents
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const STATE_COLOR: Record<string, number> = { new: 0x8a8a8a, part: 0x3fd06c, max: 0xffd24a };

// Node extents (design space) — camera clamp bounds.
const EXT = NODES.reduce(
  (e, n) => ({
    minX: Math.min(e.minX, n.x - NODE_R),
    maxX: Math.max(e.maxX, n.x + NODE_R),
    minY: Math.min(e.minY, n.y - NODE_R),
    maxY: Math.max(e.maxY, n.y + 44), // level text below the node
  }),
  { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
);

export interface TreeUI {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  onDown(ev: FederatedPointerEvent): void;
  onMove(ev: FederatedPointerEvent): void;
  onUp(ev: FederatedPointerEvent): void;
  /** Camera state for the save (PLAN Phase 2: the tree remembers). */
  getView(): TreeView | undefined;
}

export interface TreeDeps {
  overlay: Container;
  sim: SimState;
  textures: Textures;
  refreshHud(): void;
  initialView?: TreeView | null;
}

export function createTree(deps: TreeDeps): TreeUI {
  const { overlay, sim, textures } = deps;
  const treeBg = new Graphics();
  const pan = new Container();
  const header = new Text({
    text: "SKILL TREE",
    style: { fontFamily: FONT, fill: "#ffd24a", fontSize: 20, fontWeight: "700", stroke: { color: "#000", width: 4 } },
  });
  const close = new Text({ text: "✕", style: { fontFamily: FONT, fill: "#fff", fontSize: 24, fontWeight: "700" } });
  const popover = new Container();
  popover.visible = false;
  overlay.addChild(treeBg, pan, header, close, popover);

  let isOpen = false;
  let everOpened = deps.initialView != null;
  let selected: string | null = null;
  let view: TreeView = deps.initialView ?? { x: 0, y: 0, s: 1 };
  let popRect: { x: number; y: number; w: number; h: number } | null = null;

  const W = () => sim.layout.w;
  const H = () => sim.layout.h;

  // ---- camera ------------------------------------------------------------
  function clampView(): void {
    view.s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.s));
    const clampAxis = (pos: number, screen: number, min: number, max: number): number => {
      const lo = screen - (max + MARGIN) * view.s;
      const hi = -(min - MARGIN) * view.s;
      if (lo > hi) return (lo + hi) / 2; // content smaller than screen: centre
      return Math.max(lo, Math.min(hi, pos));
    };
    view.x = clampAxis(view.x, W(), EXT.minX, EXT.maxX);
    view.y = clampAxis(view.y, H(), EXT.minY, EXT.maxY);
    pan.position.set(view.x, view.y);
    pan.scale.set(view.s);
  }

  function fitAndCentreRoot(): void {
    const fit = Math.min(
      W() / (EXT.maxX - EXT.minX + MARGIN * 2),
      H() / (EXT.maxY - EXT.minY + MARGIN * 2),
    );
    view.s = Math.max(MIN_ZOOM, Math.min(1, fit));
    const root = NODES[0];
    view.x = W() / 2 - root.x * view.s;
    view.y = H() * 0.25 - root.y * view.s;
    clampView();
  }

  const toDesignX = (gx: number): number => (gx - view.x) / view.s;
  const toDesignY = (gy: number): number => (gy - view.y) / view.s;

  // ---- drawing -----------------------------------------------------------
  function centeredText(s: string, style: TextStyleOptions): Text {
    const t = new Text({ text: s, style: { fontFamily: FONT, ...style } });
    t.anchor.set(0.5);
    return t;
  }

  function nodeIcon(n: NodeDef): Container {
    const c = new Container();
    const id = n.id;
    const spriteIcon = (tex: (typeof textures.bird)[number], scale: number): Sprite => {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.scale.set(scale);
      return s;
    };
    const plus = (): Text => {
      const t = centeredText("+", {
        fill: "#7ef25d",
        fontSize: 18,
        fontWeight: "700",
        stroke: { color: "#000", width: 3 },
      });
      t.position.set(13, -10);
      return t;
    };
    if (id.startsWith("sp")) {
      const i = Number(id.slice(2));
      c.addChild(spriteIcon(textures.bird[i], i === 4 ? 1.5 : 2.2));
    } else if (id[0] === "w") {
      c.addChild(centeredText("$", { fill: "#ffd94a", fontSize: 24, fontWeight: "700" }));
    } else if (id[0] === "s") {
      c.addChild(spriteIcon(textures.icons.bolt, 2.2));
    } else if (id[0] === "g") {
      c.addChild(spriteIcon(textures.gold, 4));
    } else if (id === "bsize" || id === "bextra") {
      c.addChild(spriteIcon(textures.basket, 1.7));
      if (id === "bextra") c.addChild(plus());
    } else if (id === "tspd" || id === "ttime") {
      c.addChild(spriteIcon(textures.truck, 1.5));
      const badge = spriteIcon(id === "tspd" ? textures.icons.bolt : textures.icons.clock, 1.4);
      badge.position.set(13, -10);
      c.addChild(badge);
    } else if (id === "coll" || id === "hire") {
      c.addChild(spriteIcon(textures.coll, 2));
      if (id === "hire") c.addChild(plus());
    } else if (id === "cspd") {
      c.addChild(spriteIcon(textures.icons.wind, 2.2));
    } else if (id === "cbag") {
      c.addChild(spriteIcon(textures.icons.bag, 2.4));
    } else if (id === "cval") {
      c.addChild(spriteIcon(textures.icons.hands, 2.4));
    } else if (id === "fth") {
      c.addChild(spriteIcon(textures.icons.feather, 2.6));
    } else if (id === "ecap") {
      c.addChild(spriteIcon(textures.icons.hay, 2.4));
    } else if (id === "espoil") {
      c.addChild(spriteIcon(textures.icons.hourglass, 2.4));
    } else if (id === "sweep") {
      c.addChild(spriteIcon(textures.icons.sweep, 2.4));
    } else if (id === "combo") {
      c.addChild(spriteIcon(textures.icons.flame, 2.4));
    } else if (id === "gold2") {
      c.addChild(spriteIcon(textures.icons.coin, 2.4));
    } else if (id === "birdlot") {
      c.addChild(spriteIcon(textures.icons.tag, 2.6));
    } else if (id === "kitchen") {
      c.addChild(spriteIcon(textures.pan, 2.2));
    } else if (id.startsWith("st_")) {
      const idx = ["st_boil", "st_fry", "st_scr", "st_poa", "st_oml"].indexOf(id);
      c.addChild(spriteIcon(textures.dish[idx], 2.4));
    }
    return c;
  }

  function buildTree(): void {
    for (const c of pan.removeChildren()) c.destroy({ children: true });
    const edges = new Graphics();
    pan.addChild(edges);
    for (const n of NODES) {
      const st = nodeState(sim, n);
      if (st === "hidden") continue;
      if (n.par) {
        const path = edgePath(n);
        edges.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) edges.lineTo(path[i].x, path[i].y);
        edges.stroke({ width: 3, color: lvl(sim, n.id) > 0 ? 0x4a7ba6 : 0x33475c });
      }
      const g = new Graphics();
      g.circle(0, 0, NODE_R).fill(0x18231a);
      g.circle(0, 0, NODE_R).stroke({ width: 3, color: STATE_COLOR[st] });
      if (selected === n.id) g.circle(0, 0, 29).stroke({ width: 2, color: 0x8fe3d0 });
      g.position.set(n.x, n.y);
      const icon = nodeIcon(n);
      icon.alpha = st === "new" ? 0.45 : 1;
      g.addChild(icon);
      const l = lvl(sim, n.id);
      const lt = new Text({
        text: l >= n.max ? "MAX" : `${l}/${n.max}`,
        style: {
          fontFamily: FONT,
          fill: l >= n.max ? "#ffd24a" : l > 0 ? "#fff" : "#999",
          fontSize: 11,
          fontWeight: "700",
          stroke: { color: "#000", width: 3 },
        },
      });
      lt.anchor.set(0.5, 0);
      lt.position.set(n.x, n.y + 27);
      pan.addChild(g, lt);
    }
    clampView();
  }

  // ---- popover (select-then-tap purchase) --------------------------------
  function renderPopover(): void {
    for (const c of popover.removeChildren()) c.destroy({ children: true });
    popRect = null;
    if (!selected) {
      popover.visible = false;
      return;
    }
    const n = nodeById[selected];
    const l = lvl(sim, n.id);
    const maxed = l >= n.max;
    const isSpecies = n.id.startsWith("sp");

    const name = new Text({
      text: n.nm,
      style: { fontFamily: FONT, fontSize: 14, fontWeight: "700", fill: "#fff" },
    });
    const effect = new Text({
      text: n.dsc,
      style: { fontFamily: FONT, fontSize: 10, fill: "#cfd8cf", wordWrap: true, wordWrapWidth: 150 },
    });
    let costLabel: string;
    let affordable: boolean;
    let featherCost = false;
    if (!maxed) {
      featherCost = n.cur === "feathers";
      costLabel = n.cur === "money" ? fmtMoney(nodeCost(sim, n)) : fmt(nodeCost(sim, n));
      affordable = canAfford(sim, n);
    } else if (isSpecies) {
      const i = Number(n.id.slice(2));
      costLabel = `Bird ${fmtMoney(birdCost(sim, i))} · own ${sim.counts[i]}`;
      affordable = sim.money >= birdCost(sim, i);
    } else {
      costLabel = "MAXED";
      affordable = false;
    }
    const cost = new Text({
      text: costLabel,
      style: {
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: "700",
        fill: maxed && !isSpecies ? "#ffd24a" : affordable ? "#7ef25d" : "#9aa39a",
      },
    });

    const w = Math.max(170, Math.ceil(Math.max(name.width, effect.width, cost.width)) + 24);
    const pipY = 34 + Math.ceil(effect.height);
    const h = pipY + 34;

    const g = new Graphics();
    pixelPanel(g, 0, 0, w, h, { face: 0x24402c, frame: 0x3fd06c });
    popover.addChild(g);
    name.position.set(12, 8);
    effect.position.set(12, 28);
    popover.addChild(name, effect);
    // level pips
    const pips = new Graphics();
    for (let i = 0; i < n.max; i++) {
      pips.rect(12 + i * 14, pipY, 10, 6);
      pips.fill(i < l ? 0x3fd06c : 0x33413a);
    }
    if (n.max === 1 && maxed) {
      pips.rect(12, pipY, 10, 6).fill(0xffd24a);
    }
    popover.addChild(pips);
    cost.position.set(12, pipY + 12);
    popover.addChild(cost);
    if (featherCost) {
      const fIcon = new Sprite(textures.icons.feather);
      fIcon.anchor.set(0, 0.5);
      fIcon.scale.set(1.6);
      fIcon.position.set(12 + Math.ceil(cost.width) + 5, pipY + 12 + cost.height / 2);
      popover.addChild(fIcon);
    }

    // placement: beside the node, flipped to stay on screen, never covering it
    const nsx = view.x + n.x * view.s;
    const nsy = view.y + n.y * view.s;
    const r = (NODE_R + 8) * view.s;
    let px = nsx + r + 6;
    if (px + w > W() - 6) px = nsx - r - 6 - w;
    let py = nsy - h / 2;
    if (px < 6) {
      // no room either side: go above (or below) the node instead
      px = Math.max(6, Math.min(W() - w - 6, nsx - w / 2));
      py = nsy - r - h - 6;
      if (py < 40) py = nsy + r + 6;
    }
    py = Math.max(40, Math.min(H() - h - 8, py));
    popover.position.set(Math.round(px), Math.round(py));
    popover.visible = true;
    popRect = { x: px, y: py, w, h };
  }

  function tryBuy(): void {
    if (!selected) return;
    const n = nodeById[selected];
    const maxed = lvl(sim, n.id) >= n.max;
    const ok =
      maxed && n.id.startsWith("sp") ? buyBird(sim, Number(n.id.slice(2))) : buyNode(sim, n.id);
    if (!ok) return;
    deps.refreshHud();
    buildTree();
    renderPopover(); // updates in place — pumping levels is quick repeated taps
  }

  // ---- open/close ----------------------------------------------------------
  function open(): void {
    isOpen = true;
    overlay.visible = true;
    treeBg.clear();
    treeBg.rect(0, 0, W(), H()).fill({ color: 0x101a12, alpha: 0.97 });
    header.position.set(16, 14);
    close.position.set(W() - 40, 12);
    if (!everOpened) {
      everOpened = true;
      fitAndCentreRoot();
    }
    buildTree();
    renderPopover();
  }

  function closeTree(): void {
    isOpen = false;
    overlay.visible = false;
    selected = null;
    popover.visible = false;
  }

  // ---- input: one finger pans/taps, two fingers pinch ----------------------
  const touches = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  let pinch: { d: number; s: number } | null = null;
  let pinched = false; // a pinch this gesture kills any tap

  function onDown(ev: FederatedPointerEvent): void {
    touches.set(ev.pointerId, { x: ev.global.x, y: ev.global.y });
    if (touches.size === 2) {
      // second pointer: cancel pending tap, start pinching
      const [a, b] = [...touches.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s };
      pinched = true;
      drag = null;
    } else if (touches.size === 1) {
      drag = { x: ev.global.x, y: ev.global.y, vx: view.x, vy: view.y, moved: false };
      pinched = false;
    }
  }

  function onMove(ev: FederatedPointerEvent): void {
    const t = touches.get(ev.pointerId);
    if (!t) return;
    t.x = ev.global.x;
    t.y = ev.global.y;
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const prevS = view.s;
      const nextS = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.s * (d / pinch.d)));
      // keep the design point under the pinch midpoint fixed
      view.x = mx - ((mx - view.x) / prevS) * nextS;
      view.y = my - ((my - view.y) / prevS) * nextS;
      view.s = nextS;
      clampView();
      if (selected) renderPopover();
      return;
    }
    if (drag) {
      const dx = ev.global.x - drag.x;
      const dy = ev.global.y - drag.y;
      if (drag.moved || Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        drag.moved = true;
        view.x = drag.vx + dx;
        view.y = drag.vy + dy;
        clampView();
        if (selected) renderPopover();
      }
    }
  }

  function onUp(ev: FederatedPointerEvent): void {
    const wasDrag = drag?.moved ?? false;
    touches.delete(ev.pointerId);
    if (pinch) {
      if (touches.size < 2) pinch = null;
      if (touches.size === 1) {
        // remaining finger continues as a fresh pan
        const [t] = [...touches.values()];
        drag = { x: t.x, y: t.y, vx: view.x, vy: view.y, moved: true };
      }
      return;
    }
    if (touches.size > 0) return;
    drag = null;
    if (wasDrag || pinched) return; // pans and pinches never buy

    const gx = ev.global.x;
    const gy = ev.global.y;
    if (gx > W() - 56 && gy < 52) {
      closeTree();
      return;
    }
    if (popRect && gx >= popRect.x && gx <= popRect.x + popRect.w && gy >= popRect.y && gy <= popRect.y + popRect.h) {
      tryBuy(); // second tap on the popover buys
      return;
    }
    const lx = toDesignX(gx);
    const ly = toDesignY(gy);
    // Finger target stays ~34 screen px at every zoom; nearest node wins so
    // zoomed-out neighbours can't steal each other's taps.
    const hitR = HIT_R / view.s;
    let hit: NodeDef | null = null;
    let best = hitR * hitR;
    for (const n of NODES) {
      if (nodeState(sim, n) === "hidden") continue;
      const d2 = (n.x - lx) ** 2 + (n.y - ly) ** 2;
      if (d2 < best) {
        best = d2;
        hit = n;
      }
    }
    if (hit) {
      if (selected === hit.id) {
        tryBuy(); // second tap on the selected node buys
      } else {
        selected = hit.id;
        buildTree();
        renderPopover();
      }
      return;
    }
    // tap on empty space dismisses
    if (selected) {
      selected = null;
      buildTree();
      renderPopover();
    }
  }

  // Dev-only diagnostics (?dev=1), used by automated verification.
  if (new URLSearchParams(location.search).get("dev") === "1") {
    (window as unknown as { __tree?: unknown }).__tree = () => ({
      view: { ...view },
      selected,
      popRect,
      popVisible: popover.visible,
    });
  }

  return {
    isOpen: () => isOpen,
    open,
    close: closeTree,
    toggle(): void {
      if (isOpen) closeTree();
      else open();
    },
    onDown,
    onMove,
    onUp,
    getView(): TreeView | undefined {
      return everOpened ? { ...view } : undefined;
    },
  };
}

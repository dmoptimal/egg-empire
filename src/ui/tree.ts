// Skill tree overlay — full-screen Pixi UI ported from the prototype:
// grid layout from the nodes table, progressive reveal, drag-to-pan with a
// tap threshold, bottom info card with a buy button. Purchases go through
// the sim; SFX/popups follow from the sim's events in the main loop.

import { Container, Graphics, Sprite, Text, type FederatedPointerEvent, type TextStyleOptions } from "pixi.js";
import { fmt, fmtMoney } from "../config/format";
import { NODES, nodeById, type NodeDef } from "../config/nodes";
import {
  birdCost,
  buyBird,
  buyNode,
  canAfford,
  lvl,
  nodeCost,
  nodeState,
  type SimState,
} from "../sim";
import type { Textures } from "../render/textures";

// View geometry (prototype values) — not balance, so it lives with the UI.
const COLS = [55, 135, 215, 295];
const ROW_H = 92;
const TREE_TOP = 64;
const TREE_W = 350;
const NODE_R = 24;
const HIT_R = 34;
const MAX_ROW = Math.max(...NODES.map((n) => n.row));
const STATE_COLOR: Record<string, number> = { new: 0x8a8a8a, part: 0x3fd06c, max: 0xffd24a };

export interface TreeUI {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  onDown(ev: FederatedPointerEvent): void;
  onMove(ev: FederatedPointerEvent): void;
  onUp(ev: FederatedPointerEvent): void;
}

export interface TreeDeps {
  overlay: Container;
  sim: SimState;
  textures: Textures;
  refreshHud(): void;
}

export function createTree(deps: TreeDeps): TreeUI {
  const { overlay, sim, textures } = deps;
  const treeBg = new Graphics();
  const pan = new Container();
  const header = new Text({
    text: "SKILL TREE",
    style: { fill: "#ffd24a", fontSize: 20, fontWeight: "900", stroke: { color: "#000", width: 4 } },
  });
  const close = new Text({ text: "✕", style: { fill: "#fff", fontSize: 24, fontWeight: "900" } });
  const infoCard = new Container();
  overlay.addChild(treeBg, pan, header, close, infoCard);

  let isOpen = false;
  let selected: string | null = null;
  let panY = 0;
  let treeOffX = 0;
  let dragStart: { x: number; y: number; panY: number; moved: boolean } | null = null;
  let buyRect: { x: number; y: number; w: number; h: number } | null = null;

  const W = () => sim.layout.w;
  const H = () => sim.layout.h;

  function centeredText(s: string, style: TextStyleOptions): Text {
    const t = new Text({ text: s, style });
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
        fontWeight: "900",
        stroke: { color: "#000", width: 3 },
      });
      t.position.set(13, -10);
      return t;
    };
    if (id.startsWith("sp")) {
      const i = Number(id.slice(2));
      c.addChild(spriteIcon(textures.bird[i], i === 4 ? 1.5 : 2.2));
    } else if (id[0] === "w") {
      c.addChild(centeredText("$", { fill: "#ffd94a", fontSize: 24, fontWeight: "900" }));
    } else if (id[0] === "s") {
      c.addChild(centeredText("⚡", { fontSize: 20 }));
    } else if (id[0] === "g") {
      c.addChild(spriteIcon(textures.gold, 4));
    } else if (id === "bsize" || id === "bextra") {
      c.addChild(spriteIcon(textures.basket, 1.7));
      if (id === "bextra") c.addChild(plus());
    } else if (id === "tspd" || id === "ttime") {
      c.addChild(spriteIcon(textures.truck, 1.5));
      const t = centeredText(id === "tspd" ? "⚡" : "⏱", { fontSize: 14 });
      t.position.set(13, -10);
      c.addChild(t);
    } else if (id === "coll" || id === "hire") {
      c.addChild(spriteIcon(textures.coll, 2));
      if (id === "hire") c.addChild(plus());
    } else if (id === "cspd") {
      c.addChild(centeredText("💨", { fontSize: 20 }));
    } else if (id === "cbag") {
      c.addChild(centeredText("🎒", { fontSize: 20 }));
    } else if (id === "cval") {
      c.addChild(centeredText("🤲", { fontSize: 20 }));
    } else if (id === "fth") {
      c.addChild(centeredText("🪶", { fontSize: 20 }));
    }
    return c;
  }

  const nodePos = (n: NodeDef) => ({ x: COLS[n.col], y: TREE_TOP + n.row * ROW_H });

  function buildTree(): void {
    for (const c of pan.removeChildren()) c.destroy({ children: true });
    const edges = new Graphics();
    pan.addChild(edges);
    for (const n of NODES) {
      const st = nodeState(sim, n);
      if (st === "hidden") continue;
      const p = nodePos(n);
      if (n.par) {
        const pp = nodePos(nodeById[n.par]);
        const col = lvl(sim, n.id) > 0 ? 0x4a7ba6 : 0x33475c;
        if (n.route === "left") {
          edges
            .moveTo(pp.x, pp.y + 26)
            .lineTo(pp.x, pp.y + 44)
            .lineTo(16, pp.y + 44)
            .lineTo(16, p.y - 44)
            .lineTo(p.x, p.y - 44)
            .lineTo(p.x, p.y - 26);
        } else if (pp.y === p.y) {
          const dir = p.x > pp.x ? 1 : -1;
          edges.moveTo(pp.x + 26 * dir, pp.y).lineTo(p.x - 26 * dir, p.y);
        } else {
          edges
            .moveTo(pp.x, pp.y + 26)
            .lineTo(pp.x, (pp.y + p.y) / 2)
            .lineTo(p.x, (pp.y + p.y) / 2)
            .lineTo(p.x, p.y - 26);
        }
        edges.stroke({ width: 3, color: col });
      }
      const g = new Graphics();
      g.circle(0, 0, NODE_R).fill(0x18231a);
      g.circle(0, 0, NODE_R).stroke({ width: 3, color: STATE_COLOR[st] });
      if (selected === n.id) g.circle(0, 0, 29).stroke({ width: 2, color: 0x8fe3d0 });
      g.position.set(p.x, p.y);
      const icon = nodeIcon(n);
      icon.alpha = st === "new" ? 0.45 : 1;
      g.addChild(icon);
      const l = lvl(sim, n.id);
      const lt = new Text({
        text: l >= n.max ? "MAX" : `${l}/${n.max}`,
        style: {
          fill: l >= n.max ? "#ffd24a" : l > 0 ? "#fff" : "#999",
          fontSize: 11,
          fontWeight: "800",
          stroke: { color: "#000", width: 3 },
        },
      });
      lt.anchor.set(0.5, 0);
      lt.position.set(p.x, p.y + 27);
      pan.addChild(g, lt);
    }
    pan.x = treeOffX;
    pan.y = panY;
  }

  function renderInfo(): void {
    for (const c of infoCard.removeChildren()) c.destroy({ children: true });
    buyRect = null;
    if (!selected) return;
    const n = nodeById[selected];
    const l = lvl(sim, n.id);
    const maxed = l >= n.max;
    const ch = 136;
    const cy = H() - ch - 8;
    const g = new Graphics();
    g.roundRect(8, cy, W() - 16, ch, 14)
      .fill({ color: 0x1c2b1c, alpha: 0.98 })
      .stroke({ width: 2, color: 0x3fd06c, alpha: 0.6 });
    infoCard.addChild(g);
    const t1 = new Text({ text: n.nm, style: { fill: "#fff", fontSize: 17, fontWeight: "900" } });
    t1.position.set(24, cy + 12);
    const t2 = new Text({
      text: n.dsc,
      style: { fill: "#cfd8cf", fontSize: 12, wordWrap: true, wordWrapWidth: W() - 48 },
    });
    t2.position.set(24, cy + 38);
    const isSpecies = n.id.startsWith("sp");
    const t3 = new Text({
      text: maxed
        ? isSpecies
          ? `Owned: ${sim.counts[Number(n.id.slice(2))]}`
          : "MAXED"
        : `Level ${l}/${n.max}`,
      style: { fill: maxed ? "#ffd24a" : "#8fe3d0", fontSize: 13, fontWeight: "800" },
    });
    t3.position.set(24, cy + ch - 38);
    infoCard.addChild(t1, t2, t3);

    let label: string | undefined;
    let afford = false;
    let cur: "money" | "feathers" = "money";
    if (!maxed) {
      label = n.cur === "money" ? fmtMoney(nodeCost(sim, n)) : `${fmt(nodeCost(sim, n))} 🪶`;
      afford = canAfford(sim, n);
      cur = n.cur;
    } else if (isSpecies) {
      const i = Number(n.id.slice(2));
      label = `Bird ${fmtMoney(birdCost(sim, i))}`;
      afford = sim.money >= birdCost(sim, i);
      cur = "money";
    }
    if (label !== undefined) {
      const bw = 132;
      const bh = 42;
      const bx = W() - 24 - bw;
      const by = cy + ch - 54;
      const bg2 = new Graphics();
      bg2
        .roundRect(bx, by, bw, bh, 10)
        .fill(afford ? (cur === "money" ? 0x2f9d5c : 0x1f8a76) : 0x4a4a4a);
      const bt = centeredText(label, { fill: afford ? "#fff" : "#999", fontSize: 14, fontWeight: "900" });
      bt.position.set(bx + bw / 2, by + bh / 2);
      infoCard.addChild(bg2, bt);
      buyRect = { x: bx, y: by, w: bw, h: bh };
    }
  }

  function tryBuy(): void {
    if (!selected) return;
    const n = nodeById[selected];
    const maxed = lvl(sim, n.id) >= n.max;
    const ok = maxed && n.id.startsWith("sp")
      ? buyBird(sim, Number(n.id.slice(2)))
      : buyNode(sim, n.id);
    if (!ok) return;
    deps.refreshHud();
    buildTree();
    renderInfo();
  }

  function open(): void {
    isOpen = true;
    overlay.visible = true;
    treeOffX = Math.max(0, (W() - TREE_W) / 2);
    treeBg.clear();
    treeBg.rect(0, 0, W(), H()).fill({ color: 0x101a12, alpha: 0.97 });
    header.position.set(16, 14);
    close.position.set(W() - 40, 12);
    buildTree();
    renderInfo();
  }

  function closeTree(): void {
    isOpen = false;
    overlay.visible = false;
    selected = null;
  }

  return {
    isOpen: () => isOpen,
    open,
    close: closeTree,
    toggle(): void {
      if (isOpen) closeTree();
      else open();
    },
    onDown(ev: FederatedPointerEvent): void {
      dragStart = { x: ev.global.x, y: ev.global.y, panY, moved: false };
    },
    onMove(ev: FederatedPointerEvent): void {
      if (!dragStart) return;
      const dy = ev.global.y - dragStart.y;
      if (Math.abs(dy) > 8 || dragStart.moved) {
        dragStart.moved = true;
        const contentH = TREE_TOP + MAX_ROW * ROW_H + 80;
        const minY = Math.min(0, H() - 160 - contentH);
        panY = Math.max(minY, Math.min(0, dragStart.panY + dy));
        pan.y = panY;
      }
    },
    onUp(ev: FederatedPointerEvent): void {
      if (!dragStart) return;
      const wasDrag = dragStart.moved;
      dragStart = null;
      if (wasDrag) return;
      const gx = ev.global.x;
      const gy = ev.global.y;
      if (gx > W() - 56 && gy < 52) {
        closeTree();
        return;
      }
      if (buyRect && gx >= buyRect.x && gx <= buyRect.x + buyRect.w && gy >= buyRect.y && gy <= buyRect.y + buyRect.h) {
        tryBuy();
        return;
      }
      const lx = gx - treeOffX;
      const ly = gy - panY;
      let hit: NodeDef | null = null;
      for (const n of NODES) {
        if (nodeState(sim, n) === "hidden") continue;
        const p = nodePos(n);
        if ((p.x - lx) ** 2 + (p.y - ly) ** 2 < HIT_R * HIT_R) {
          hit = n;
          break;
        }
      }
      if (hit) {
        selected = hit.id;
        buildTree();
        renderInfo();
      }
    },
  };
}

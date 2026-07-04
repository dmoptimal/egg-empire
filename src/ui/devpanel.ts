// Dev admin panel (PLAN.md Phase 0 §5). Plain DOM by design — it's a testing
// tool, not part of the game, and is explicitly exempt from the Phase 1
// "no DOM" rule. Only mounted when the URL has ?dev=1.
//
// Era-jump presets write a checkpoint as the save and reload, reusing the
// exact same CHECKPOINTS the pacing tests assert against — they cannot drift.

import { CHECKPOINTS } from "../config/economy";
import { NODES } from "../config/nodes";
import { checkpointToSave, serialize, type SaveData, type SimState } from "../sim";

export interface DevPanelDeps {
  sim: SimState;
  refresh(): void;
  getSpeed(): number;
  setSpeed(x: number): void;
  /** Write a save (null = wipe) and reload with autosave stood down. */
  loadState(save: SaveData | null): void;
}

export function createDevPanel(deps: DevPanelDeps): void {
  const panel = document.createElement("div");
  panel.id = "devpanel";
  panel.style.cssText =
    "position:absolute;top:calc(44px + env(safe-area-inset-top));left:6px;z-index:3;" +
    "background:rgba(0,0,0,.75);border-radius:10px;padding:6px;display:flex;" +
    "flex-direction:column;gap:4px;font:11px/1.2 system-ui;color:#fff;max-width:170px";

  // Collapsible: a slim header stays; everything else folds away.
  const head = document.createElement("div");
  head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:6px";
  const headTitle = document.createElement("span");
  headTitle.textContent = "dev";
  headTitle.style.cssText = "opacity:.7;font-weight:700";
  const foldBtn = document.createElement("button");
  foldBtn.id = "devfold";
  foldBtn.textContent = "–";
  foldBtn.style.cssText =
    "font:inherit;color:#fff;background:#444;border:0;border-radius:6px;padding:1px 8px";
  head.append(headTitle, foldBtn);
  panel.appendChild(head);
  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:4px";
  panel.appendChild(body);
  let folded = false;
  foldBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    folded = !folded;
    body.style.display = folded ? "none" : "flex";
    foldBtn.textContent = folded ? "+" : "–";
  });

  const row = (): HTMLDivElement => {
    const d = document.createElement("div");
    d.style.cssText = "display:flex;flex-wrap:wrap;gap:3px";
    body.appendChild(d);
    return d;
  };

  const btn = (parent: HTMLElement, label: string, fn: () => void): void => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      "font:inherit;color:#fff;background:#2f6fdb;border:0;border-radius:6px;padding:3px 6px";
    b.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      fn();
    });
    parent.appendChild(b);
  };

  const title = (text: string): void => {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText = "opacity:.7;font-weight:700;margin-top:2px";
    body.appendChild(t);
  };

  title("money");
  const money = row();
  for (const amt of [1e3, 1e6, 1e9, 1e12]) {
    btn(money, `+${amt.toExponential(0).replace("e+", "e")}`, () => {
      deps.sim.money += amt;
      deps.refresh();
    });
  }
  btn(money, "×10", () => {
    deps.sim.money *= 10;
    deps.refresh();
  });

  title("feathers");
  const feathers = row();
  for (const amt of [1e3, 1e6, 1e9, 1e12]) {
    btn(feathers, `+${amt.toExponential(0).replace("e+", "e")}`, () => {
      deps.sim.feathers += amt;
      deps.refresh();
    });
  }
  btn(feathers, "×10", () => {
    deps.sim.feathers *= 10;
    deps.refresh();
  });

  title("era jump");
  const eras = row();
  for (const cp of CHECKPOINTS) {
    btn(eras, cp.id, () => {
      deps.loadState({ ...checkpointToSave(cp), lastSeen: Date.now() });
    });
  }

  title("tools");
  const tools = row();
  btn(tools, "max tree", () => {
    const save = serialize(deps.sim, Date.now());
    for (const n of NODES) save.n[n.id] = n.max;
    save.counts = save.counts.map((c) => Math.max(c, 1));
    save.won = true; // suppress the win fanfare on a dev jump
    deps.loadState(save);
  });
  btn(tools, "reset", () => deps.loadState(null));
  const speedBtn = document.createElement("button");
  speedBtn.textContent = "speed ×1";
  speedBtn.style.cssText =
    "font:inherit;color:#fff;background:#7a4adb;border:0;border-radius:6px;padding:3px 6px";
  speedBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    deps.setSpeed(deps.getSpeed() === 1 ? 5 : 1);
    speedBtn.textContent = `speed ×${deps.getSpeed()}`;
  });
  tools.appendChild(speedBtn);

  document.getElementById("game")!.appendChild(panel);
}

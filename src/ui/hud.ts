// DOM HUD: money/feather chips, mute toggle, bird shop strip, skill tree
// button, and the hint text. Stays DOM (as in the prototype) until PLAN.md
// Phase 1 moves the UI into the canvas.

import { fmt, fmtMoney } from "../config/format";
import { SPECIES } from "../config/species";
import { audioInit, toggleMute } from "../audio/sfx";
import { birdCost, unlocked, type SimState } from "../sim";

export interface Hud {
  refresh(): void;
  showHint(): void;
  hideHint(): void;
}

export interface HudDeps {
  sim: SimState;
  onBuyBird(species: number): void;
  onToggleTree(): void;
}

export function createHud(deps: HudDeps): Hud {
  const el = (id: string) => document.getElementById(id)!;
  const elMoney = el("money");
  const elFeathers = el("feathers");
  const muteChip = el("mute");
  const shopEl = el("shop");
  const hintEl = el("hint");
  const shopBtns = new Map<number, HTMLButtonElement>();

  muteChip.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    muteChip.textContent = toggleMute() ? "🔇" : "🔊";
  });

  el("togglePanel").addEventListener("pointerdown", () => {
    audioInit();
    deps.onToggleTree();
  });

  function refresh(): void {
    const s = deps.sim;
    elMoney.textContent = fmtMoney(s.money);
    elFeathers.textContent = `${fmt(s.feathers)} 🪶`;
    for (let i = 0; i < SPECIES.length; i++) {
      if (!unlocked(s, i)) continue;
      let b = shopBtns.get(i);
      if (!b) {
        b = document.createElement("button");
        const species = i;
        b.addEventListener("pointerdown", () => {
          audioInit();
          deps.onBuyBird(species);
        });
        shopEl.insertBefore(b, shopEl.firstChild); // newest species first
        shopBtns.set(i, b);
      }
      const c = birdCost(s, i);
      b.innerHTML = `${SPECIES[i].name} <small>${fmtMoney(c)} · own ${s.counts[i]}</small>`;
      b.disabled = s.money < c;
    }
  }

  return {
    refresh,
    showHint(): void {
      hintEl.style.opacity = "1";
    },
    hideHint(): void {
      hintEl.style.opacity = "0";
    },
  };
}

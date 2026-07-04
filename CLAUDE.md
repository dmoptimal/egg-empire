# CLAUDE.md — Egg Empire port

The working game is `prototype/egg-empire.html` — a single-file PixiJS v7
prototype, tested on iPhone. It is the **source of truth for behaviour,
feel, and balance**. The job of this repo is to port it to the module
structure under `src/` using Pixi v8 + Vite + TypeScript, without changing
how the game plays. When in doubt, open the prototype and match it.

## The two-system rule (non-negotiable)

1. **The simulation must not import the renderer.** `src/sim/` is pure TS
   over plain state. No imports from `src/render/`, `src/ui/`, `src/audio/`,
   or `pixi.js`. Must run headless under vitest.
   Note: eggs are *gameplay* entities (the player collects them), so egg
   positions/lifecycles live in a sim-owned list — but their sprites and all
   tweens/particles are render-side, mapped from that list.
2. **Visual counts are capped independently of sim values.** Bird sprites
   cap at 22/species regardless of owned count; ground+falling eggs cap at
   80 (oldest spoils); popups pool at 60. Sim numbers never size a pool.

## Performance rules

- No allocation in the render loop: pools everywhere (ring-buffer pattern
  in the prototype), reuse a single shared noise buffer for audio.
- Fixed-accumulator sim (lay rates), variable-rate render.
- `resolution: Math.min(devicePixelRatio, 2)`, `autoDensity: true`.
- Pause ticker on `visibilitychange`; save on hide (save system is NEW work,
  see README — the prototype has none because artifacts can't persist).

## Pixi v7 → v8 migration notes (prototype uses v7 from CDN)

- `new Application()` then `await app.init({...})` (v8) instead of options
  in the constructor; canvas is `app.canvas`, not `app.view`.
- Graphics API: v7 `g.beginFill(c).drawRect(...).endFill()` becomes
  `g.rect(...).fill(c)` in v8; `drawEllipse` → `ellipse().fill()`.
- Nearest-neighbour scaling: v7 `BaseTexture.defaultOptions.scaleMode`
  → v8 `TextureSource.defaultOptions.scaleMode = 'nearest'`.
- `new Text({text, style})` object form in v8.
- Text stroke style is `{stroke: {color, width}}` in v8, not
  `stroke`/`strokeThickness`.
- Event system is the same (`eventMode`, pointer events, `ev.global`,
  `ev.pointerId`).

## Gotchas we already hit (do not rediscover these)

- **Sprite children position relative to the anchor point**, not the
  texture corner. Basket fill overlay and rim eggs use anchor-relative
  coords (see `drawBasketFill`): with anchor (0.5, 1), "inside the basket"
  is x∈[-7,7], y∈[-9,-2].
- **Z-order**: trucks must render in front of baskets; collectors between.
  Layer order (back→front): bg, birds, eggs, baskets, collectors,
  trucks+labels, fx/popups, tree overlay, win screen, start screen.
- **DOM overlays vs canvas**: anything absolutely-positioned over the
  canvas needs an explicit z-index above it (the canvas is appended last).
- **Audio must init/resume on a user gesture** (iOS). First pointerdown
  calls `audioInit()`. Throttle high-frequency SFX (egg landings: ≥60ms
  apart; spoils: ≥200ms).
- Truck schedule timer only accumulates while the basket has ≥1 egg, and
  each basket shows a countdown — silent timers read as bugs.

## Data-driven design

All balance lives in two tables, already extracted to `src/config/`:
- `species.ts` — the 5 birds (costs, egg values, lay intervals, scales)
- `nodes.ts` — the full skill tree (30 nodes: id, parent, grid position,
  max level, cost curve, currency)
Gameplay code must read these tables; no magic numbers in systems code.
Win condition = every node at max level.

## Dependencies

- pixi.js, vite, typescript, vitest only. 72-hour cooldown on adding any
  new dependency after its latest publish (supply-chain rule).

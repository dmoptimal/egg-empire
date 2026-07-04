# PLAN — Egg Empire: Economy, Pixel UI, Tree Revamp + The Kitchen

A phased prompt plan for Claude Code. Do this **after** the base port
(README.md steps 1–6) is complete and the game plays identically to
`prototype/egg-empire.html`. Each phase ends with something Dan can play
on his phone. Do not start a phase until the previous one is approved.

---

## Design goals

1. **Numbers must escalate like an incremental.** Start at $10 eggs and
   end in the trillions and beyond (K → M → B → T → Qa → Qi …). Every
   cost is indexed to the era in which it unlocks — no late-game node may
   cost an early-game amount. This is Phase 0 and everything else builds
   on it.
2. **Everything lives in the canvas, and everything is pixel art.** No
   DOM UI: the HUD, shop bar, buttons, skill tree, and popovers are all
   PixiJS, so the game is one self-contained canvas. No rounded corners
   anywhere — chunky pixel frames, hard edges, bitmap-style type.
3. **The skill tree should sprawl.** A central spine with branches
   radiating off hub nodes, optional side-branches, cheap filler nodes
   between big unlocks, and sub-trees that appear when a gate node is
   bought. Hub nodes with 3–6 children. Primary growth is **vertical**
   (thumb-scroll), pan on both axes once wider than the screen.
4. **Buying in the tree is select-then-tap.** First tap selects a node
   and shows a popover beside it; tapping again buys. No trekking to a
   card at the bottom of the screen.
5. **A second layer of play: The Kitchen.** Unlocks mid-game (after
   ducks). Raw eggs route to a kitchen and are cooked into higher-value
   dishes by chefs, collected by a separate kitchen truck. Second screen,
   same visual grammar as the farm.
6. **Currency note (do not act yet).** Feathers stay for now. Dan flags
   the theme as "a bit weird" — a later pass may retheme (candidates:
   golden yolks, recipe stars). Keep all currency strings/icons in one
   config spot so a retheme is a one-file change.

---

## Phase 0 — Economy & big numbers overhaul (do this FIRST)

**Prompt to run:**
> Implement the economy overhaul per PLAN.md Phase 0: big-number
> formatting, era-indexed costs and income, and pacing tests. Pure sim +
> config work — no rendering changes beyond the formatter. All curves go
> in src/config/economy.ts; nothing inline.

### The problem being fixed

Today, ostrich "Egg worth" level 1 costs 40🪶 — pocket change by the time
ostriches unlock, because species-tier cost scaling is linear (×tier)
while the player's income has grown by orders of magnitude. Feather
income is also flat (1/egg) all game. Result: late branches are trivially
maxed the moment they reveal. Costs and income must both grow
geometrically with era so the purchase *cadence* stays constant while
the raw numbers inflate enormously.

### 1. Number formatter

Suffix ladder: K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc (1e3 … 1e33), then
scientific (`1.23e36`) beyond. Three significant figures. One function in
config, used everywhere (HUD, popups, node costs, shop). Plain JS floats
are fine to ~1e308 — no big-number library (72h dep rule; not needed).

### 2. Era-indexed values (targets, tune via tests)

Species value ladder steepens to ~×30 per tier, and unlocks/bird costs
follow:

| tier | species | egg value | unlock | bird base |
|---|---|---|---|---|
| 1 | Chicken | $10 | — | $50 |
| 2 | Duck | $300 | $2.5K | $600 |
| 3 | Quail | $9K | $150K | $18K |
| 4 | Goose | $250K | $8M | $500K |
| 5 | Ostrich | $8M | $400M | $16M |

Worth upgrade becomes ×1.5 per level (→ ×7.6 at max) instead of ×1.25,
so with golden ×10, kitchen multipliers (Phase 4), and basket sizes,
endgame payouts land in the trillions — a full basket of golden ostrich
omelettes should read in T/Qa territory.

Feather income scales with tier instead of flat: base feathers per egg =
[1, 4, 10, 25, 60] by species (golden ×15 of that), still multiplied by
the Feathered Eggs node. Feather costs scale geometrically with tier:
tierMult = 12^(tier−1) replacing the linear ×tier in all species-branch
cost curves (so ostrich worth L1 ≈ 165K🪶 — meaningful in-era, not
pocket change).

### 3. Pacing tests (the acceptance criteria)

Vitest "time-to-afford" tests: simulate steady-state income at defined
checkpoints (e.g. "just unlocked ducks with 5 ducks", "just unlocked
ostriches with 3 ostriches + typical upgrades") and assert:
- first level of any newly-revealed node costs **1–3 minutes** of
  checkpoint income (its own currency);
- max level of a branch costs **20–40 minutes** cumulative;
- species unlocks cost **5–15 minutes** of the previous era's income.
These bands ARE the balance spec — tune the tables until they pass, and
they guard every later phase against regression.

### 4. Migration

The prototype's numbers are superseded by this phase — update
src/config/species.ts and nodes.ts, and note the change at the top of
CLAUDE.md so "match the prototype" explicitly excludes economy values.
Kitchen tables in Phases 4/6 inherit the same era-indexing rule
(re-derive them from the pacing bands rather than the placeholder
numbers below).

### 5. Dev admin panel (build it here, use it in every later phase)

A plain DOM panel is fine — it's a testing tool, not part of the game,
and is explicitly exempt from the Phase 1 "no DOM" rule. Shown only when
the URL has `?dev=1`. Contents:
- Grant money / feathers: +1K, +1M, +1B, +1T style buttons plus a
  "×10 current" button for each currency.
- **Era jump presets**: one button per pacing-test checkpoint ("fresh
  start", "just unlocked ducks", "quail era", "goose era", "ostrich
  era", "full tree") that sets money, feathers, bird counts, and node
  levels to that checkpoint. Define the checkpoints ONCE in
  src/config/economy.ts and share them between the pacing tests and the
  admin panel so they can never drift apart.
- Max entire tree / max selected branch; reset save; sim speed ×1/×5.

Acceptance: formatter handles 1e3→1e36+; all pacing tests green; playing
from scratch, every newly revealed node feels "expensive but reachable";
HUD comfortably displays T/Qa figures without layout breakage; admin
panel can jump to any era in two taps.

---

## Phase 1 — All-canvas pixel UI kit (kill the DOM)

**Prompt to run:**
> Implement the pixel UI kit per PLAN.md Phase 1 and migrate every DOM
> element into Pixi. When done, index.html contains only the canvas
> mount; the game is fully self-contained in one canvas, and nothing
> on screen has a rounded corner.

### UI kit (src/ui/kit.ts)

- **Pixel panel/button primitives**: hard-cornered rects with a chunky
  2–3px pixel frame and a 1px corner-notch bevel (the retro look — never
  `roundedRect`). Pressed state = content shifts down 2px + darker face,
  matching the old DOM button feel. Disabled = grey face, dim text.
- **Pixel type (DECIDED: Pixelify Sans)**: bundle the OFL-licensed
  Pixelify Sans font file locally in the repo (asset file, not a runtime
  CDN fetch). It is the ONE typeface for the entire game — HUD, shop,
  tree, popovers, start screen, win screen, everything. Register a
  `BitmapFont` at boot for hot text (money HUD, popups, basket labels —
  anything updated per second); standard Text with the same family only
  for long descriptions. Sizes on a 8/16 px rhythm.
- **Tap handling**: one shared press/tap helper with the same
  tap-vs-drag threshold as the tree, and pointer capture per button.
- **Safe areas**: env(safe-area-inset-*) isn't visible from canvas —
  read the insets once from a hidden DOM probe (or visualViewport) and
  feed them into layout so the bottom bar clears the home indicator.

### Migration

- HUD chips (money, feathers, mute) → Pixi, top of canvas.
- Bottom bar → Pixi: shop strip becomes a horizontally drag-scrollable
  Pixi container of pixel buttons (newest species left), plus the Skill
  tree button. Keep 44px+ hit targets.
- Tree overlay: replace the roundedRect info card styling with pixel
  panels (the card itself is removed in Phase 2 — don't over-polish it).
- Hint text, start screen, win screen: already Pixi; restyle to the
  pixel type + frames.
- Delete the DOM CSS for chips/bar; index.html keeps only the canvas
  mount and viewport meta.

Acceptance: zero interactive DOM elements (sole exception: the ?dev=1
admin panel from Phase 0); screenshot shows a single
coherent pixel aesthetic; shop strip scrolls and buys reliably; no
regression in collection input; safe-area respected on iPhone.

---

## Phase 2 — Tree engine revamp + select-then-tap buying

**Prompt to run:**
> Refactor the skill tree per PLAN.md Phase 2: free node coordinates,
> both-axis pan, and the popover purchase flow. Keep every existing
> node, cost, and effect identical.

- `NodeDef` gains `x, y` (design-space px) replacing `col, row`. One-off
  mapping for the existing 30 nodes.
- Edges: keep single `par`. Optional `edge: "elbow" | "straight"` per
  node; default elbow. Kill the `route:"left"` special case by placing
  nodes where edges don't cross.
- Pan both axes, clamped to node extents + margins.
- **Pinch to zoom**: two-finger pinch scales the tree between 0.4× and
  1.5×, anchored on the pinch midpoint, with pan bounds recomputed per
  zoom level. On open, auto-fit within that range if the tree exceeds
  the screen. Node tap hit-testing must account for the current scale.
  Do NOT add double-tap-to-zoom — it would collide with the
  select-then-tap purchase flow. A pinch (second pointer down) cancels
  any pending tap so zooming can never buy.
- **The tree remembers where you were**: persist pan position (and zoom)
  in the save; reopening the tree restores the last view instead of
  resetting to the top. First-ever open centres on the root.
- **Purchase popover (replaces the bottom info card):**
  - First tap selects a node: highlight ring + a small pixel-panel
    popover anchored beside it (auto-flips side/above when near an
    edge, never off-screen, never covering the node).
  - Popover contents: name, one-line effect, level pips, cost in its
    currency — coloured green when affordable, grey when not. Maxed
    species nodes show the bird-buy price instead.
  - **Second tap on the node (or the popover) buys**, plays the buy
    SFX, updates the popover in place — so pumping five levels is five
    quick taps on the spot. Tapping anywhere else dismisses; panning
    never buys.
  - Reveal/state visuals unchanged: hidden until parent ≥1, grey /
    green / gold, level pips.

Acceptance: tree plays the same but buying is select-then-tap with no
bottom card; popover never renders off-screen; drag or pinch never
triggers a purchase; pinch zoom is smooth with correct hit-testing at
every scale; no per-frame allocation added.

---

## Phase 3 — Tree content: the sprawl

**Prompt to run:**
> Implement the Phase 3 node layout from PLAN.md: reposition existing
> nodes into the spine-and-branches shape and add the new filler/support
> nodes listed. Costs follow Phase 0 era-indexing. No kitchen nodes yet.

Shape (top → bottom): Chickens is the root hub near the top-centre.
Species spine runs downward (chicken → duck → quail → goose → ostrich).
Each species node is a hub with its worth/speed/golden branch fanning to
one side, alternating sides per species so the tree zig-zags instead of
listing. The farm branch (baskets/trucks) hangs off Ducks to the opposite
side; the collector branch hangs off baskets. This creates the canopy +
hanging sub-trees silhouette of the reference shots.

New support nodes (all feathers unless noted; costs shown as pre-Phase-0
shorthand — re-derive from the pacing bands):
| id | name | max | parent | effect |
|---|---|---|---|---|
| ecap | Roomier hay | 4 | bsize | +20 ground egg cap per lvl (80→160) |
| espoil | Fresh eggs | 4 | ecap | +5s egg spoil time per lvl |
| sweep | Wider sweep | 3 | sp2 | +8px swipe radius per lvl |
| combo | Hot streak | 3 | sweep | swiped eggs +5% value per combo lvl |
| gold2 | Midas flock | 1 | g2 | golden eggs drop 1 bonus feather on collect |
| birdlot | Bulk deals | 3 | sp3 | bird cost growth −0.02 per lvl (all species) |

(Exact positions: Claude Code proposes a layout, screenshots it, Dan
approves before wiring effects.)

Acceptance: every new node's effect implemented in sim with a vitest
each; win condition still = all nodes maxed (now including new ones);
popover flow works across the full sprawl.

---

## Phase 4 — The Kitchen: sim + routing

**Prompt to run:**
> Implement the kitchen simulation per PLAN.md Phase 4, headless with
> vitest coverage, before any kitchen rendering.

Model:
- Tree gate node `kitchen` ("The Kitchen", max 1, parent `sp1`, cost in
  money — duck-era per the pacing bands). Buying it unlocks the kitchen
  screen and the kitchen sub-tree (Phase 6).
- **Routing (DECIDED: auto):** each farm truck payout offers its egg
  load to the kitchen pantry first; whatever doesn't fit is sold raw as
  today. No player-facing routing control in v1 (a routing slider/node
  is a Phase 7 candidate if the auto rule ever feels limiting). Pantry
  base capacity 30 eggs (upgradeable). Eggs entering the pantry carry
  their value (incl. golden flag; golden cooks into premium dishes worth
  ×10).
- **Stations** (unlocked in order via tree):

| station | eggs in | cook time | value mult | chef slots |
|---|---|---|---|---|
| Boiled | 1 | 4s | ×3 | 3 |
| Fried | 1 | 6s | ×5 | 3 |
| Scrambled | 2 | 8s | ×9 | 3 |
| Poached | 1 | 12s | ×16 | 3 |
| Omelette | 3 | 18s | ×45 | 3 |

- **Chefs:** hired per station with money (era-indexed). Each chef works
  one pan: takes eggs from pantry, cooks, outputs a plated dish to the
  counter. Counter capacity 20 dishes.
- **Kitchen truck:** separate truck on the kitchen road; collects the
  counter when full or on the farm truck-schedule tech (ttime applies to
  both). Payout = sum of dish values; feathers per dish = eggs-in ×
  featherPerEgg (species-tier scaled per Phase 0).
- Balance intent: kitchen roughly ×3–5s the raw-sale income for the same
  eggs at comparable investment, omelettes as the late-game spike. The
  first omelette payout should feel like a species unlock.

Acceptance: vitest covers routing overflow, cook timing, multi-egg
recipes, golden premium dishes, counter/truck flow. No rendering yet.

---

## Phase 5 — The Kitchen: screen + rendering

**Prompt to run:**
> Build the kitchen screen per PLAN.md Phase 5, using the Phase 1 pixel
> UI kit and the farm's layer stack, pools, and popup/audio systems.

- **Screen switching:** two pixel tabs (Farm 🐔 / Kitchen 🍳) in the
  bottom bar, visible once kitchen is unlocked. Both sims always run;
  screens are views. Instant switch.
- Layout mirrors the farm: pantry + station counters across the top half
  (one counter per unlocked station, chefs animate at their pans),
  plated dishes on the counter rail below, kitchen road + truck at the
  bottom. Same pixel-texture factory; new textures: pan, chef (recolour
  of collector with a hat), one dish per station, pantry crate.
- Juice: quiet throttled sizzle while any pan cooks (WebAudio filtered
  noise), plate "ding" on dish completion, cha-ching family pitched up
  for the kitchen truck.
- Popups for dish values; a small "→ 🍳 N" indicator on farm truck
  payouts showing eggs routed to the pantry.

Acceptance: playable loop — unlock kitchen, eggs route, hire a chef,
watch boiled eggs sell for more; 60fps with both sims running; kitchen
UI is pixel-kit native (no rounded anything).

---

## Phase 6 — Kitchen tree branch

Kitchen nodes join the SAME tree (one tree, one completion goal), as a
distinct sub-tree hanging from the `kitchen` gate node — visually its
own cluster, like the hanging groups in the reference screenshots.

| id | name | max | parent | effect |
|---|---|---|---|---|
| kitchen | The Kitchen | 1 | sp1 | unlock kitchen screen |
| st_boil | Boiled station | 1 | kitchen | unlock boiled |
| st_fry | Fried station | 1 | st_boil | unlock fried |
| st_scr | Scrambled station | 1 | st_fry | unlock scrambled |
| st_poa | Poached station | 1 | st_scr | unlock poached |
| st_oml | Omelette station | 1 | st_poa | unlock omelette |
| pantry | Bigger pantry | 5 | kitchen | +30 pantry cap/lvl |
| ckspd | Faster pans | 5 | st_boil | cook time ×0.9/lvl |
| ckval | Secret seasoning | 5 | st_fry | dish value +10%/lvl |
| chefs2 | Sous chefs | 2 | st_scr | +1 chef slot per station per lvl |
| counter | Long counter | 3 | pantry | +20 counter cap/lvl |

All costs era-indexed via the Phase 0 pacing bands (kitchen spans
duck-to-ostrich eras). Win condition now includes all kitchen nodes.
Re-check completion pacing: target a committed player finishing the full
tree in roughly 3–5 hours of active play. Adjust feather income before
touching node costs.

---

## Phase 7 — Polish pass (after Dan plays 4–6)

Candidates, pick with Dan: kitchen offline progress, per-station
golden-dish effects, chef hats per station, active-play bonus tuning
(swipe vs collectors), currency retheme decision.

---

## Decisions (answered by Dan)

1. **Pixel font**: Pixelify Sans, one typeface across the entire game —
   no special font for the start screen or anywhere else.
2. **Routing control**: auto — kitchen pantry fills first, overflow
   sells raw. No slider in v1.
3. **Tree structure**: one tree (single completion goal), and it
   reopens at the last pan position rather than resetting.
4. **Currency retheme**: OPEN — Dan to decide during Phase 7. Until
   then feathers stay, and all currency strings/icons remain in one
   config spot.

## Working rules (repeat of CLAUDE.md, they still apply)

Sim never imports render; kitchen sim is headless-testable; all new
visual entities pooled and capped (dish counter cap IS the pool size);
no per-frame allocation; every balance number in `src/config/`, never
inline; no rounded corners anywhere post-Phase 1; screenshot layout
proposals for approval before wiring; one phase per session, tested on
the phone before the next.

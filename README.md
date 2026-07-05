# Egg Empire

A mobile-first browser incremental game. Birds waddle in the top field and
lay eggs that drop onto the hay below; you tap, swipe, or hold to sweep
them into baskets; trucks collect full (or scheduled part-full) baskets and
pay out money and feathers; feathers buy your way through a progressive
skill tree. **Maxing the entire tree is the win condition.**

`prototype/egg-empire.html` is the complete, working, phone-tested game —
open it in a browser to play. This repo is the port target: same game,
proper modules, Pixi v8, plus the features listed under "New work".

```bash
npm install
npm run dev      # open the LAN URL on a phone
npm run test     # headless sim tests
npm run build
```

## Current feature set (all in the prototype, all to be preserved)

- **5 species**: chickens → ducks ($2.5K) → quail ($30K) → geese ($450K)
  → ostriches ($7.5M), each with its own pixel sprite, egg, value, and
  lay interval. Bird shop strip along the bottom bar (one button per
  unlocked species, newest first).
- **Egg physics**: eggs fall from birds over the fence, bounce once on the
  hay, spoil after 25s (fade-out). Ground cap 80, oldest spoils first.
- **Collection**: tap, swipe (segment-swept so fast flicks don't skip),
  or hold (per-frame vacuum under the finger). Multi-touch. Eggs arc into
  the nearest basket with space along a quadratic bezier.
- **Baskets & trucks**: up to 4 baskets, each with its own truck. Fill bar
  inside the basket, eggs poke over the rim at 55/80/100%. Truck dispatches
  when full, or on a visible countdown (level-gated) for part-full loads.
  Payout popups + feathers on collection.
- **Collectors**: unlockable farmhands; hire up to 5; upgrades for speed,
  bag size (multi-egg trips, ×N shown overhead), and Gentle Hands
  (+10%/lvl value on collector-gathered eggs).
- **Skill tree**: full-screen Pixi overlay, 30 nodes on a grid with
  orthogonal edges. Progressive reveal (node appears when parent has ≥1
  level). Grey = revealed/unbought, green = in progress, gold = MAX.
  Drag to pan, tap for info card with buy button. Species nodes double as
  a bird shop after unlock.
- **Feather economy**: 1🪶/egg, 15🪶/golden at delivery; "Feathered eggs"
  node adds +1/egg and +10/golden per level.
- **Audio**: fully synthesized WebAudio (no assets) — combo-pitched
  collection pops, golden arpeggio, hay thuds, spoil slide, truck honk,
  cha-ching payout, buy/unlock chimes, ambient clucks that scale with
  flock size, win fanfare. Mute chip in the HUD.
- **Screens**: title screen (birds perched on the EGG EMPIRE logo,
  tap to start — this is also the audio-unlock gesture), win screen.

## Port plan (in order)

1. **Extract the sim.** Species/node tables are already in `src/config/`.
   Move economy math (costs, multipliers, lay accumulation, egg lifecycle
   list, basket/truck state machines, collector logic) into `src/sim/`
   as pure functions over a state object. Vitest: cost curves, lay rates,
   truck schedule gating, tree completion.
2. **Render layer.** Pixi v8 app, texture factory (pixel-rect + egg
   generators from the prototype), layer stack per CLAUDE.md, pools for
   eggs/popups. Match the prototype visually before adding anything.
3. **Input.** Pointer map + segment sweep + hold vacuum, tree pan/tap.
4. **Audio module.** Port the synth verbatim (tone/noise helpers + SFX
   table + throttles).
5. **Skill tree UI.** Grid layout from `nodes.ts`, reveal/state colours,
   info card, buy flow.
6. **New work — saves**: serialize `S` (money, feathers, counts, node
   levels, totalDelivered) + `lastSeen` to localStorage, versioned.
   Offline progress: estimate income while away (idle rate only counts if
   truck schedule + collectors are unlocked; cap 8h) and show a
   welcome-back toast.
7. **New work — PWA wrapper** (manifest + icon + service worker) so it
   installs to a home screen.
8. **Balance pass**: active swiping currently outscales collectors until
   Gentle Hands is levelled; consider an active-play bonus or per-species
   spoil timers. Playtest before changing numbers.

## Balance reference (PLAN.md Phase 0 era-indexed economy)

All curves live in `src/config/economy.ts`; the pacing tests in
`src/sim/pacing.test.ts` are the spec (1–3min first levels, 20–40min
branches, 5–15min species unlocks — tune tables until they pass).

- Egg values ~×30/tier: $10 / $300 / $9K / $250K / $8M; unlocks
  $2.5K / $150K / $8M / $400M; bird costs `base × 1.35–1.45^owned`.
- Upgrades: worth +50%/lvl ×5 (×7.6 maxed); lay speed ×0.90/lvl; golden
  +2%/lvl (base 2%). Species-branch costs scale ×12^(tier−1) in feathers.
- Feathers/egg by tier: 1/6/34/500/7.5K (golden ×15); Feathered Eggs node
  multiplies all feather income ×(1+lvl).
- Baskets: 12 + 8/lvl (soft-caps to 2× while the truck runs); extra baskets $40K/$2M/$50M.
- Trucks: speed ×1.3/lvl; schedule 20/14/9/6/4s (only while ≥1 egg).
- Collectors: hires $30K→$1B era-indexed; speed ×1.25/lvl; bag 1+lvl;
  Gentle Hands +10%/lvl.
- Dev tools: append `?dev=1` for grants, era jumps, max tree, ×5 speed.

## Performance budget

60fps on a mid-range phone with: up to 440 eggs (Golden Rush at max
Roomier hay), ~110 bird sprites, 60 popups, 4 trucks, 5 collectors.
Zero per-frame allocation in steady state — check ?dev=1's fps readout.

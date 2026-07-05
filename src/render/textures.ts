// Texture factory: every sprite in the game is generated from pixel-rect
// tables (no image assets), ported from the prototype. v8 API: shapes chain
// then .fill(), and nearest-neighbour scaling comes from textureSourceOptions.

import { Graphics, type Renderer, type Texture } from "pixi.js";

type Px = readonly [number, number, number, number, number]; // x, y, w, h, color

export interface Textures {
  bird: Texture[];
  birdScale: number[];
  egg: Texture[];
  gold: Texture;
  basket: Texture;
  truck: Texture;
  coll: Texture;
  chef: Texture;
  /** Walk-in kitchen customers — one texture per `look` palette. */
  customer: Texture[];
  /** The Dinner Rush VIP: top hat and a gold jacket. */
  vip: Texture;
  /** The night fox (day/night cycle) — faces up the screen. */
  fox: Texture;
  /** Restaurant dressing: a customer table and the waiter who serves it. */
  table: Texture;
  waiter: Texture;
  pan: Texture;
  crate: Texture;
  /** One plated dish per station (boiled → omelette). */
  dish: Texture[];
  /** Pixel icon set — the game uses no emoji glyphs anywhere. */
  icons: {
    feather: Texture;
    speakerOn: Texture;
    speakerOff: Texture;
    bolt: Texture;
    clock: Texture;
    wind: Texture;
    bag: Texture;
    hands: Texture;
    hay: Texture;
    hourglass: Texture;
    sweep: Texture;
    flame: Texture;
    coin: Texture;
    tag: Texture;
    trophy: Texture;
    star: Texture;
    gear: Texture;
  };
}

export function makeTextures(renderer: Renderer): Textures {
  const gen = (g: Graphics): Texture =>
    renderer.generateTexture({ target: g, textureSourceOptions: { scaleMode: "nearest" } });

  const tex = (px: Px[]): Texture => {
    const g = new Graphics();
    for (const [x, y, w, h, c] of px) g.rect(x, y, w, h).fill(c);
    return gen(g);
  };

  /** The collector frame with hair colours instead of a hat (customers). */
  const person = (hair: number, skin: number, shirt: number, legs: number): Texture =>
    tex([[3, 0, 4, 2, hair], [2, 1, 6, 1, hair], [3, 2, 4, 3, skin], [4, 3, 1, 1, 0x111111], [2, 5, 6, 5, shirt], [1, 5, 2, 4, skin], [7, 5, 2, 4, skin], [3, 10, 1, 3, legs], [6, 10, 1, 3, legs]]);

  const eggTex = (color: number, speckle = false): Texture => {
    const g = new Graphics();
    g.ellipse(3, 3.5, 2.6, 3.4).fill(color);
    g.rect(2, 1, 1, 1).fill({ color: 0xffffff, alpha: 0.5 });
    if (speckle) g.rect(2, 3, 1, 1).rect(4, 5, 1, 1).rect(3, 2, 1, 1).fill(0x6b5136);
    return gen(g);
  };

  // Chicken, duck, quail, goose, ostrich — pixel tables verbatim.
  const bird = [
    tex([[1, 5, 7, 5, 0xf7f0dd], [0, 4, 2, 3, 0xe8dfc8], [7, 2, 3, 4, 0xf7f0dd], [7, 1, 3, 1, 0xd43a2f], [10, 3, 2, 1, 0xf2a03d], [8, 3, 1, 1, 0x1a1a1a], [3, 10, 1, 2, 0xf2a03d], [6, 10, 1, 2, 0xf2a03d]]),
    tex([[1, 5, 8, 5, 0x8a5a33], [0, 4, 2, 3, 0x6e4526], [8, 2, 3, 4, 0x2e7d43], [8, 5, 3, 1, 0xf0f0e8], [11, 3, 2, 1, 0xe8c531], [9, 3, 1, 1, 0x111111], [3, 10, 1, 2, 0xe8952e], [6, 10, 1, 2, 0xe8952e]]),
    tex([[1, 3, 7, 5, 0x9c7a4e], [2, 4, 1, 1, 0x6b5136], [5, 5, 1, 1, 0x6b5136], [6, 3, 1, 1, 0x6b5136], [6, 1, 2, 3, 0x9c7a4e], [4, 0, 1, 2, 0x2b2b2b], [8, 2, 1, 1, 0xd8a03d], [7, 1, 1, 1, 0x111111], [3, 8, 1, 1, 0xd8a03d], [5, 8, 1, 1, 0xd8a03d]]),
    tex([[1, 8, 9, 6, 0xf5f2ea], [0, 7, 2, 4, 0xe6e2d5], [8, 2, 2, 7, 0xf5f2ea], [8, 0, 3, 2, 0xf5f2ea], [11, 1, 2, 1, 0xe8952e], [9, 1, 1, 1, 0x111111], [3, 14, 1, 2, 0xe8952e], [6, 14, 1, 2, 0xe8952e]]),
    tex([[2, 9, 9, 7, 0x2b2b2b], [3, 10, 5, 4, 0x3d3d3d], [9, 2, 2, 8, 0xd8b090], [9, 0, 3, 2, 0xd8b090], [12, 1, 2, 1, 0xc9773a], [10, 1, 1, 1, 0x111111], [5, 16, 1, 6, 0xe0a8a0], [8, 16, 1, 6, 0xe0a8a0], [4, 22, 3, 1, 0xc9773a], [7, 22, 3, 1, 0xc9773a]]),
  ];

  return {
    bird,
    birdScale: [3, 3, 3, 3, 3.4],
    egg: [eggTex(0xfff3da), eggTex(0xdff0e0), eggTex(0xe6d4ac, true), eggTex(0xf7f5ee), eggTex(0xf0e6cf)],
    gold: eggTex(0xffd24a),
    basket: tex([[0, 2, 18, 10, 0x8a5a2b], [1, 3, 16, 8, 0xa06c36], [0, 2, 18, 2, 0x6e4520], [4, 4, 1, 7, 0x8a5a2b], [9, 4, 1, 7, 0x8a5a2b], [14, 4, 1, 7, 0x8a5a2b]]),
    truck: tex([[0, 4, 16, 8, 0x3a7bd5], [1, 5, 14, 6, 0x4a8be5], [16, 5, 8, 7, 0x2c5fa8], [18, 6, 4, 3, 0xbfe3ff], [3, 12, 4, 4, 0x1a1a1a], [4, 13, 2, 2, 0x666666], [18, 12, 4, 4, 0x1a1a1a], [19, 13, 2, 2, 0x666666]]),
    coll: tex([[3, 0, 4, 2, 0xe8c531], [2, 1, 6, 1, 0xe8c531], [3, 2, 4, 3, 0xe8b48a], [4, 3, 1, 1, 0x111111], [2, 5, 6, 5, 0x3a6bb5], [1, 5, 2, 4, 0xe8b48a], [7, 5, 2, 4, 0xe8b48a], [3, 10, 1, 3, 0x2b3a5a], [6, 10, 1, 3, 0x2b3a5a]]),
    // The chef is the collector in whites: toque, apron, grey trousers.
    chef: tex([[3, -1, 4, 1, 0xf5f5f0], [3, 0, 4, 2, 0xf5f5f0], [2, 1, 6, 1, 0xe8e8e0], [3, 2, 4, 3, 0xe8b48a], [4, 3, 1, 1, 0x111111], [2, 5, 6, 5, 0xe8e8e0], [1, 5, 2, 4, 0xe8b48a], [7, 5, 2, 4, 0xe8b48a], [3, 10, 1, 3, 0x3a3a3a], [6, 10, 1, 3, 0x3a3a3a]]),
    // Townsfolk share the collector's frame: hair instead of a hat.
    customer: [
      person(0x5a3a22, 0xe8b48a, 0xc0453a, 0x2b3a5a), // brunette, red top
      person(0x2b2b2b, 0xc98a5a, 0x3aa8a0, 0x3a3a3a), // black hair, teal top
      person(0xd88a2e, 0xf0c8a0, 0x8a5ab5, 0x4a3a2a), // ginger, purple top
      person(0x9a9a9a, 0xe8b48a, 0x4a8a3a, 0x2b2b2b), // grey hair, green top
    ],
    vip: tex([[2, -3, 6, 1, 0x1a1a1a], [3, -3, 4, 1, 0x1a1a1a], [3, -2, 4, 2, 0x1a1a1a], [2, 0, 6, 1, 0x1a1a1a], [3, 1, 4, 1, 0xffd24a], [3, 2, 4, 3, 0xe8b48a], [4, 3, 1, 1, 0x111111], [2, 5, 6, 5, 0xe8b431], [4, 5, 2, 2, 0xf5f5f0], [1, 5, 2, 4, 0xe8b48a], [7, 5, 2, 4, 0xe8b48a], [3, 10, 1, 3, 0x2b2b2b], [6, 10, 1, 3, 0x2b2b2b]]),
    table: tex([[0, 0, 14, 1, 0x6e4520], [0, 1, 14, 3, 0xa06c36], [1, 4, 2, 5, 0x6e4520], [11, 4, 2, 5, 0x6e4520]]),
    // Front-of-house: dark suit, white shirt front.
    waiter: tex([[3, 0, 4, 2, 0x4a2f1d], [2, 1, 6, 1, 0x4a2f1d], [3, 2, 4, 3, 0xe8b48a], [4, 3, 1, 1, 0x111111], [2, 5, 6, 5, 0x2b2b2b], [4, 5, 2, 4, 0xf5f5f0], [1, 5, 2, 4, 0xe8b48a], [7, 5, 2, 4, 0xe8b48a], [3, 10, 1, 3, 0x2b2b2b], [6, 10, 1, 3, 0x2b2b2b]]),
    fox: tex([[2, 0, 2, 3, 0xd96a2b], [8, 0, 2, 3, 0xd96a2b], [2, 1, 1, 1, 0x111111], [9, 1, 1, 1, 0x111111], [2, 3, 8, 4, 0xd96a2b], [4, 4, 1, 1, 0x111111], [7, 4, 1, 1, 0x111111], [5, 5, 2, 2, 0xf5eee0], [3, 7, 6, 4, 0xd96a2b], [5, 7, 2, 2, 0xf5eee0], [9, 8, 3, 2, 0xd96a2b], [12, 8, 1, 2, 0xf5eee0], [3, 11, 1, 2, 0x8a3a12], [7, 11, 1, 2, 0x8a3a12]]),
    pan: tex([[2, 2, 8, 2, 0x2b2b2b], [3, 3, 6, 2, 0x3d3d3d], [2, 4, 8, 1, 0x2b2b2b], [10, 2, 4, 2, 0x6b4a2b]]),
    crate: tex([[0, 0, 14, 12, 0x6e4520], [1, 1, 12, 10, 0xa06c36], [1, 4, 12, 1, 0x8a5a2b], [1, 8, 12, 1, 0x8a5a2b], [6, 1, 2, 10, 0x8a5a2b]]),
    dish: [
      // boiled — white egg on a plate
      tex([[0, 5, 10, 2, 0xd8d8e0], [3, 2, 4, 3, 0xfff6e0], [4, 1, 2, 1, 0xfff6e0]]),
      // fried — white with a yolk
      tex([[0, 5, 10, 2, 0xd8d8e0], [1, 3, 8, 2, 0xfff8f0], [2, 2, 6, 1, 0xfff8f0], [4, 3, 2, 2, 0xf2b53d]]),
      // scrambled — a yellow pile
      tex([[0, 5, 10, 2, 0xd8d8e0], [2, 3, 6, 2, 0xf2cf5d], [3, 2, 4, 1, 0xf2cf5d]]),
      // poached — a pale cup
      tex([[0, 5, 10, 2, 0xd8d8e0], [3, 2, 4, 3, 0xe8e8f0], [2, 4, 6, 1, 0xc8c8d8]]),
      // omelette — a folded crescent
      tex([[0, 5, 10, 2, 0xd8d8e0], [1, 3, 8, 2, 0xf2c04d], [2, 2, 5, 1, 0xf2c04d], [6, 2, 3, 1, 0xe8a53d]]),
    ],
    icons: {
      feather: tex([[5, 0, 2, 1, 0x8fe3d0], [4, 1, 3, 1, 0x8fe3d0], [3, 2, 4, 1, 0x8fe3d0], [2, 3, 4, 1, 0x8fe3d0], [1, 4, 4, 1, 0x8fe3d0], [0, 5, 4, 1, 0x8fe3d0], [0, 6, 2, 1, 0x8fe3d0], [5, 1, 1, 1, 0x5aa898], [4, 2, 1, 1, 0x5aa898], [3, 3, 1, 1, 0x5aa898], [2, 4, 1, 1, 0x5aa898], [1, 5, 1, 1, 0x5aa898]]),
      speakerOn: tex([[0, 3, 2, 4, 0xe8e8e8], [2, 2, 2, 6, 0xe8e8e8], [4, 0, 2, 10, 0xe8e8e8], [7, 3, 1, 4, 0xbfe3ff], [8, 1, 1, 3, 0xbfe3ff], [8, 6, 1, 3, 0xbfe3ff]]),
      speakerOff: tex([[0, 3, 2, 4, 0x9a9a9a], [2, 2, 2, 6, 0x9a9a9a], [4, 0, 2, 10, 0x9a9a9a], [7, 2, 1, 2, 0xff8a8a], [9, 2, 1, 2, 0xff8a8a], [8, 4, 1, 2, 0xff8a8a], [7, 6, 1, 2, 0xff8a8a], [9, 6, 1, 2, 0xff8a8a]]),
      bolt: tex([[3, 0, 3, 1, 0xffd94a], [2, 1, 3, 1, 0xffd94a], [1, 2, 3, 1, 0xffd94a], [0, 3, 6, 1, 0xffd94a], [3, 4, 3, 1, 0xffd94a], [2, 5, 3, 1, 0xffd94a], [1, 6, 2, 1, 0xffd94a]]),
      clock: tex([[2, 0, 4, 1, 0xdfefff], [1, 1, 1, 1, 0xdfefff], [6, 1, 1, 1, 0xdfefff], [0, 2, 1, 4, 0xdfefff], [7, 2, 1, 4, 0xdfefff], [1, 6, 1, 1, 0xdfefff], [6, 6, 1, 1, 0xdfefff], [2, 7, 4, 1, 0xdfefff], [4, 2, 1, 3, 0x8fe3d0], [4, 4, 2, 1, 0x8fe3d0]]),
      wind: tex([[0, 1, 6, 1, 0xdfefff], [6, 0, 1, 1, 0xdfefff], [2, 3, 7, 1, 0xbfe3ff], [0, 5, 5, 1, 0xdfefff], [5, 6, 1, 1, 0xdfefff]]),
      bag: tex([[2, 0, 1, 2, 0x8a3a30], [5, 0, 1, 2, 0x8a3a30], [1, 2, 6, 2, 0xa03028], [1, 4, 6, 4, 0xc0453a], [3, 5, 2, 2, 0xe8b431]]),
      hands: tex([[0, 3, 3, 2, 0xe8b48a], [5, 3, 3, 2, 0xe8b48a], [1, 5, 6, 2, 0xe8b48a], [2, 2, 1, 1, 0xe8b48a], [5, 2, 1, 1, 0xe8b48a], [3, 6, 2, 1, 0xd8a077]]),
      hay: tex([[3, 0, 1, 5, 0xd9b45a], [1, 1, 1, 4, 0xd9b45a], [5, 1, 1, 4, 0xd9b45a], [2, 2, 1, 3, 0xc79f45], [4, 2, 1, 3, 0xc79f45], [1, 5, 5, 2, 0xc79f45]]),
      hourglass: tex([[0, 0, 7, 1, 0xdfefff], [1, 1, 5, 1, 0xf2cf5d], [2, 2, 3, 1, 0xf2cf5d], [3, 3, 1, 1, 0xd9b45a], [2, 4, 3, 1, 0x6a5a48], [1, 5, 5, 1, 0xf2cf5d], [0, 6, 7, 1, 0xdfefff]]),
      sweep: tex([[0, 1, 1, 2, 0xe8b48a], [2, 0, 1, 3, 0xe8b48a], [4, 0, 1, 3, 0xe8b48a], [6, 1, 1, 2, 0xe8b48a], [1, 3, 6, 3, 0xe8b48a], [1, 6, 5, 1, 0xd8a077]]),
      flame: tex([[3, 0, 1, 1, 0xff9a3d], [2, 1, 2, 2, 0xff9a3d], [4, 2, 2, 2, 0xff6a2b], [1, 3, 5, 2, 0xff6a2b], [2, 5, 3, 2, 0xffd94a], [3, 4, 2, 2, 0xffd94a]]),
      coin: tex([[2, 0, 4, 1, 0xffd24a], [1, 1, 6, 1, 0xffd24a], [0, 2, 8, 3, 0xffd24a], [1, 5, 6, 1, 0xffd24a], [2, 6, 4, 1, 0xffd24a], [3, 2, 2, 3, 0xe8b431]]),
      tag: tex([[0, 2, 5, 4, 0xd9b45a], [5, 3, 1, 2, 0xd9b45a], [6, 4, 1, 1, 0xd9b45a], [1, 3, 1, 1, 0x6a5a48]]),
      trophy: tex([[0, 1, 1, 2, 0xffd24a], [7, 1, 1, 2, 0xffd24a], [1, 0, 6, 1, 0xffd24a], [1, 1, 6, 3, 0xe8b431], [2, 4, 4, 1, 0xffd24a], [3, 5, 2, 2, 0xe8b431], [2, 7, 4, 1, 0xffd24a]]),
      gear: tex([[3, 0, 3, 2, 0xc8c8d0], [3, 7, 3, 2, 0xc8c8d0], [0, 3, 2, 3, 0xc8c8d0], [7, 3, 2, 3, 0xc8c8d0], [2, 2, 5, 5, 0xc8c8d0], [3, 3, 3, 3, 0x9a9aa8], [4, 4, 1, 1, 0x2b2b2b]]),
      star: tex([[3, 0, 1, 2, 0xffd24a], [3, 5, 1, 2, 0xffd24a], [0, 3, 2, 1, 0xffd24a], [5, 3, 2, 1, 0xffd24a], [2, 2, 3, 3, 0xffe38a], [3, 3, 1, 1, 0xffffff]]),
    },
  };
}

/** Egg sprite scale as the prototype computes it (golden eggs run 15% big). */
export function eggSpriteScale(eggScale: number, golden: boolean): number {
  return eggScale * (golden ? 1.15 : 1);
}

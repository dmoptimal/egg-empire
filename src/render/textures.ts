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
}

export function makeTextures(renderer: Renderer): Textures {
  const gen = (g: Graphics): Texture =>
    renderer.generateTexture({ target: g, textureSourceOptions: { scaleMode: "nearest" } });

  const tex = (px: Px[]): Texture => {
    const g = new Graphics();
    for (const [x, y, w, h, c] of px) g.rect(x, y, w, h).fill(c);
    return gen(g);
  };

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
  };
}

/** Egg sprite scale as the prototype computes it (golden eggs run 15% big). */
export function eggSpriteScale(eggScale: number, golden: boolean): number {
  return eggScale * (golden ? 1.15 : 1);
}

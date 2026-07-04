// Field / hay / road backdrop, redrawn on resize. Ported verbatim — the straw
// flecks use the deterministic (i*97, i*61) scatter, not Math.random, so the
// backdrop never shimmers across redraws.

import type { Graphics } from "pixi.js";
import type { Layout } from "../sim";

export function drawBackground(bg: Graphics, layout: Layout): void {
  const { w: W, h: H, hayTop, roadY } = layout;
  bg.clear();
  bg.rect(0, 0, W, hayTop).fill(0x63a344);
  for (let y = 0; y < hayTop; y += 44)
    for (let x = ((y / 44) % 2) * 22; x < W; x += 44) bg.rect(x, y, 22, 22);
  bg.fill(0x5a9339);
  bg.rect(0, hayTop - 4, W, 4).fill(0x6e4520);
  for (let x = 14; x < W; x += 64) bg.rect(x, hayTop - 16, 5, 16);
  bg.fill(0x6e4520);
  bg.rect(0, hayTop, W, roadY - 12 - hayTop).fill(0xd9b45a);
  for (let i = 0; i < 90; i++) {
    const x = (i * 97) % W;
    const y = hayTop + ((i * 61) % (roadY - 16 - hayTop));
    bg.rect(x, y, 7, 2);
  }
  bg.fill(0xc79f45);
  bg.rect(0, roadY - 12, W, 26).fill(0x565656);
  for (let x = 8; x < W; x += 52) bg.rect(x, roadY, 20, 3);
  bg.fill(0xdddddd);
  bg.rect(0, roadY + 14, W, H - roadY - 14).fill(0x4a7c2f);
}

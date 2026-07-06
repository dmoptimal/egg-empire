// The 2× chicken's frames are data — verify their invariants headlessly so
// a bad hand-edit can't ship a torn frame.

import { describe, expect, it } from "vitest";
import { CHICK_ANIMS, CHICK_H, CHICK_PAL, CHICK_W, EGG2X, withOutline } from "./chicken2x";

const CHARS = new Set([...Object.keys(CHICK_PAL), "."]);

describe("frame maps", () => {
  it("every frame is exactly 24×22 and uses only palette characters", () => {
    for (const [name, anim] of Object.entries(CHICK_ANIMS))
      for (const m of anim.maps) {
        expect(m, name).toHaveLength(CHICK_H);
        for (const row of m) {
          expect(row, name).toHaveLength(CHICK_W);
          for (const ch of row) expect(CHARS.has(ch), `${name}: '${ch}'`).toBe(true);
        }
      }
  });

  it("walking is a stride — the legs swap front/back, not feet in place", () => {
    const [c1, p1, c2, p2] = CHICK_ANIMS.walk.maps;
    // the near (bright) foot is in front on one contact, behind on the other
    expect(c1[20].indexOf("bbbb")).toBeGreaterThan(c1[20].indexOf("BBBB"));
    expect(c2[20].indexOf("BBBB")).toBeGreaterThan(c2[20].indexOf("bbbb"));
    // passing frames tuck the swinging foot up off the ground row
    expect(p1[19]).toContain("BBB");
    expect(p1[20]).not.toContain("B");
    expect(p2[19]).toContain("bbb");
    expect(p2[20]).not.toContain("b");
    // the body bounces: pecked down on the contacts (comb clears row 0-1),
    // risen on the passes (comb reaches the top row)
    expect(c1[1]).not.toContain("r");
    expect(c1[0]).not.toContain("r");
    expect(p1[0]).toContain("r");
  });

  it("roosting tucks the legs away entirely", () => {
    const settled = CHICK_ANIMS.sit.maps[2];
    for (const y of [18, 19, 20]) {
      expect(settled[y]).not.toContain("b");
      expect(settled[y]).not.toContain("B");
    }
  });

  it("sleeping closes the eye (no glint anywhere)", () => {
    for (const m of CHICK_ANIMS.sleep.maps) expect(m.join("")).not.toContain("E");
  });

  it("outline wraps fill without changing dimensions", () => {
    const o = withOutline(CHICK_ANIMS.idle.maps[0]);
    expect(o).toHaveLength(CHICK_H);
    expect(o[0]).toHaveLength(CHICK_W);
    let outlines = 0;
    for (let y = 0; y < CHICK_H; y++)
      for (let x = 0; x < CHICK_W; x++) {
        const before = CHICK_ANIMS.idle.maps[0][y][x];
        const after = o[y][x];
        if (before !== ".") expect(after).toBe(before); // fill untouched
        if (after === "O") outlines++;
      }
    expect(outlines).toBeGreaterThan(30);
    expect(withOutline(EGG2X).join("")).toContain("O");
  });
});

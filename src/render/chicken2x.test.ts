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

  it("walking keeps feet on the ground row; head pecks on contact frames", () => {
    const [a, pass, b] = CHICK_ANIMS.walk.maps;
    expect(a[20]).toContain("b");
    expect(b[20]).toContain("b");
    expect(a[1]).not.toContain("r"); // comb dropped a row on the peck…
    expect(a[2]).toContain("r");
    expect(pass[1]).toContain("r"); // …and is back up on the pass
  });

  it("roosting tucks the legs away entirely", () => {
    const settled = CHICK_ANIMS.sit.maps[2];
    expect(settled[18]).not.toContain("b");
    expect(settled[19]).not.toContain("b");
    expect(settled[20]).not.toContain("b");
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

// The 2×-detail chicken (24×22, Dan's art-upgrade pilot, 2026-07-06) and its
// animation frames, all as pure pixel maps — no pixi imports, so frame logic
// runs headless under vitest. This is the staging ground for the PNG
// frame-strip pipeline: when Dan's drawn strips land in public/art/, they
// replace these generated frames one-for-one (same sizes, same counts).

export const CHICK_W = 24;
export const CHICK_H = 22;

/** Palette characters shared by every frame ('.' = transparent). */
export const CHICK_PAL: Record<string, number> = {
  w: 0xf7f0dd, // body cream (the live sprite's colour)
  W: 0xfffdf2, // highlight
  s: 0xe8dfc8, // shade — the old tail tone
  d: 0xccbd99, // deep shade
  r: 0xd43a2f, // comb
  R: 0xa8271f, // comb shadow
  p: 0xe0584a, // wattle
  b: 0xf2a03d, // beak + legs
  B: 0xc77f2a, // beak underside
  e: 0x1a1a1a, // eye
  E: 0xffffff, // eye glint
  O: 0x6b5136, // outline (quail-speckle brown)
};

const BASE = [
  "........................",
  "...............rr.rr....",
  "...............Rrrrr....",
  "...............Rrrr.....",
  "..www..........wwwww....",
  ".wssss........swweEwwbb.",
  ".wsssd........swweewwBB.",
  ".sssdd........swwwwww...",
  "..sddd........swwwwpp...",
  "...sddd........wwwwp....",
  "....wwWWWWWWWwwwwwww....",
  "....wwwwwwwwwwwwwWWWw...",
  "...wwwwwwwsssssswWWWw...",
  "..wwwwwwwssssssssWWww...",
  "..wwwwwwwddsssssswwww...",
  "..wwwwwwwddddddwwwwww...",
  "...wsssssssssssssssw....",
  ".....dddddddddddd.......",
  ".........BB...bb........",
  ".........BB...bb........",
  "........BBBB.bbbb.......",
  "........................",
];

const grid = (m: string[]): string[][] => m.map((r) => [...r]);
const rows = (g: string[][]): string[] => g.map((r) => r.join(""));

/** Move every filled cell in a rect by (dx,dy) — collect, blank, repaste. */
export function shiftRegion(
  m: string[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dx: number,
  dy: number,
): string[] {
  const g = grid(m);
  const moved: [number, number, string][] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (g[y][x] !== ".") {
        moved.push([x + dx, y + dy, g[y][x]]);
        g[y][x] = ".";
      }
  for (const [x, y, c] of moved)
    if (x >= 0 && x < CHICK_W && y >= 0 && y < CHICK_H) g[y][x] = c;
  return rows(g);
}

/** External 1px outline: transparent cells 4-adjacent to fill become 'O'. */
export function withOutline(m: string[]): string[] {
  const g = grid(m);
  const fill = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < m[0].length && y < m.length && m[y][x] !== ".";
  for (let y = 0; y < m.length; y++)
    for (let x = 0; x < m[0].length; x++)
      if (m[y][x] === "." && (fill(x - 1, y) || fill(x + 1, y) || fill(x, y - 1) || fill(x, y + 1)))
        g[y][x] = "O";
  return rows(g);
}

// Head block (comb + head + beak + wattle + neck) — everything that bobs.
const bob = (m: string[]): string[] => shiftRegion(m, 13, 0, 23, 9, 0, 1);
// Whole bird above the legs sinks k px onto its haunches; feet stay put and
// the body swallows the legs as it comes down.
const squat = (m: string[], k: number): string[] => shiftRegion(m, 0, 0, 23, 17, 0, k);
// Blink the top eye row away (glint included) — a closed lash line remains.
const closeEyes = (m: string[], drop: number): string[] => {
  const g = grid(m);
  g[5 + drop][17] = "w";
  g[5 + drop][18] = "w";
  return rows(g);
};
const withRows = (m: string[], repl: Record<number, string>): string[] =>
  m.map((r, y) => repl[y] ?? r);

// Walk: a real stride, learned the hard way (Dan, 2026-07-06). Fixed leg
// columns with sliding feet = moonwalk; symmetric frames that only swap leg
// tones = feet pumping in and out. What sells it: (1) a wide-spread contact
// pose with the legs angled and every foot's toes pointing FORWARD (1px rear
// toe only — no backwards feet), (2) a passing pose where the swing foot is
// clearly lifted off the ground, and (3) the whole body dipping on the
// contacts (head peck) and rising 1px on the passes — the bounce carries
// the walk. Near leg is bright, far leg darker.
const raise = (m: string[]): string[] => shiftRegion(m, 0, 0, 23, 17, 0, -1);
const contactA = withRows(bob(BASE), {
  18: "..........BB.bb.........",
  19: "........BB.....bb.......",
  20: ".......BBBB...bbbb......",
});
const contactB = withRows(bob(BASE), {
  18: "..........bb.BB.........",
  19: "........bb.....BB.......",
  20: ".......bbbb...BBBB......",
});
const passA = withRows(raise(BASE), {
  17: "..........BB.bb.........",
  18: "..........BB.bb.........",
  19: ".........BBBB.bb........",
  20: "............bbbb........",
});
const passB = withRows(raise(BASE), {
  17: "..........bb.BB.........",
  18: "..........bb.BB.........",
  19: ".........bbbb.BB........",
  20: "............BBBB........",
});

// Lay: settle onto the hay, eyes shut, tail flicks — the egg (a separate
// sprite; eggs are gameplay entities) pops on the strain frame.
const squat1 = squat(BASE, 1);
const squat2 = closeEyes(squat(BASE, 2), 2);
const strain = shiftRegion(squat2, 0, 6, 7, 11, 0, -1);
export const LAY_EGG_FRAME = 2; // spawn the egg when this frame shows

// Roost: sink down until the legs tuck away, then sleep — slow nestling loop.
const settled = squat(BASE, 3);
const asleep = closeEyes(settled, 3);
const nestled = closeEyes(shiftRegion(settled, 13, 0, 23, 12, 0, 1), 4);

export interface ChickAnim {
  maps: string[][];
  fps: number;
  loop: boolean;
}

export const CHICK_ANIMS: Record<"idle" | "walk" | "lay" | "sit" | "sleep", ChickAnim> = {
  idle: { maps: [BASE, bob(BASE)], fps: 2.4, loop: true },
  walk: { maps: [contactA, passA, contactB, passB], fps: 8, loop: true },
  lay: { maps: [squat1, squat2, strain, squat1], fps: 6, loop: false },
  sit: { maps: [squat1, squat(BASE, 2), settled], fps: 5, loop: false },
  sleep: { maps: [asleep, nestled], fps: 1, loop: true },
};

// A matching 2× egg (10×11 before outline) in the same palette.
export const EGG2X = [
  "..........",
  "...wwww...",
  "..wwwwww..",
  "..wWWwww..",
  ".wwWWwwww.",
  ".wwwwwwww.",
  ".wwwwwwww.",
  ".wwwwwwss.",
  "..wwwwss..",
  "...wsss...",
  "..........",
];

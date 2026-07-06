// Graphics gallery (?gfx=1) — a dev page listing every sprite and backdrop
// swatch in the game so real art can be drawn against it. Each cell shows
// the graphic at 8× (nearest-neighbour) with its native pixel size, and the
// image itself is the ACTUAL native-resolution PNG — click to download,
// redraw it at the same size (or scaled up), and hand it back.
// Plain DOM by design, same exemption as the ?dev=1 panel.

import { Application, Graphics, type Renderer, type Texture } from "pixi.js";
import { SPECIES } from "./config/species";
import { STATIONS } from "./config/kitchen";
import { makeTextures } from "./render/textures";

interface Entry {
  slug: string;
  label: string;
  tex: Texture;
  note?: string;
  swatch?: boolean; // backdrop tile — gets its own section on the sheet
}

/** Backdrop patterns from background.ts / kitchen.ts, as samplable swatches. */
function makeSwatches(renderer: Renderer): Entry[] {
  const gen = (draw: (g: Graphics) => void, slug: string, label: string, note?: string): Entry => {
    const g = new Graphics();
    draw(g);
    const tex = renderer.generateTexture({ target: g, textureSourceOptions: { scaleMode: "nearest" } });
    return { slug, label, tex, note, swatch: true };
  };
  return [
    gen((g) => {
      g.rect(0, 0, 88, 88).fill(0x63a344);
      for (let y = 0; y < 88; y += 44)
        for (let x = ((y / 44) % 2) * 22; x < 88; x += 44) g.rect(x, y, 22, 22);
      g.fill(0x5a9339);
    }, "field-grass", "Field grass", "44px repeating checker"),
    gen((g) => {
      g.rect(0, 12, 88, 4).fill(0x6e4520);
      g.rect(14, 0, 5, 16).fill(0x6e4520);
      g.rect(78, 0, 5, 16).fill(0x6e4520);
    }, "fence", "Fence rail + posts", "posts every 64px"),
    gen((g) => {
      g.rect(0, 0, 88, 44).fill(0xd9b45a);
      g.rect(6, 8, 7, 2).rect(40, 30, 7, 2).rect(66, 14, 7, 2).rect(22, 36, 7, 2).fill(0xc79f45);
    }, "hay", "Hay (with straw flecks)", "flecks are 7×2"),
    gen((g) => {
      g.rect(0, 0, 88, 26).fill(0x565656);
      g.rect(8, 12, 20, 3).rect(60, 12, 20, 3).fill(0xdddddd);
    }, "road", "Road", "dashes 20×3, every 52px"),
    gen((g) => g.rect(0, 0, 88, 44).fill(0x4a7c2f), "verge-grass", "Verge grass (below road)"),
    gen((g) => {
      g.rect(0, 0, 88, 88).fill(0x8a7a68);
      for (let y = 0; y < 88; y += 44)
        for (let x = ((y / 44) % 2) * 22; x < 88; x += 44) g.rect(x, y, 22, 22);
      g.fill(0x7e6e5c);
    }, "kitchen-floor", "Kitchen floor tiles"),
    gen((g) => g.rect(0, 0, 88, 44).fill(0x5a4a3c), "kitchen-wall", "Kitchen wall"),
    gen((g) => g.rect(0, 0, 88, 30).fill(0x14273a), "title-bg", "Title screen backdrop"),
    gen((g) => {
      g.rect(0, 0, 88, 88).fill(0x241a2e);
      for (let y = 0; y < 88; y += 44)
        for (let x = ((y / 44) % 2) * 22; x < 88; x += 44) g.rect(x, y, 22, 22);
      g.fill(0x2b2036);
    }, "casino-floor", "Casino floor (all cabinets)"),
    gen((g) => g.rect(0, 0, 88, 44).fill(0x1d3a2a), "pachinko-felt", "Pachinko/roulette felt"),
    gen((g) => g.rect(0, 0, 88, 44).fill(0x6a2438), "slots-cabinet", "Slot machine cabinet"),
  ];
}

export async function showGallery(): Promise<void> {
  const app = new Application();
  await app.init({ width: 8, height: 8, backgroundAlpha: 0 });
  const t = makeTextures(app.renderer);

  const entries: Entry[] = [
    ...SPECIES.map((sp, i) => ({ slug: `bird-${sp.name.toLowerCase()}`, label: sp.name, tex: t.bird[i], note: `waddles in the field; view scale ×${t.birdScale[i]}` })),
    ...SPECIES.map((sp, i) => ({ slug: `egg-${sp.name.toLowerCase()}`, label: `${sp.name} egg`, tex: t.egg[i], note: `game scale ×${sp.eggScale}` })),
    { slug: "egg-golden", label: "Golden egg", tex: t.gold, note: "any species, 2%+ chance" },
    { slug: "egg-moon", label: "Moon egg", tex: t.moon, note: "falls from the roost at night; catch it mid-fall" },
    { slug: "firefly", label: "Firefly", tex: t.firefly, note: "night mote — swipe through for feathers" },
    { slug: "basket", label: "Basket", tex: t.basket, note: "scale ×3.2; fill overlay drawn inside" },
    { slug: "truck", label: "Truck", tex: t.truck, note: "farm + kitchen trucks, scale ×3" },
    { slug: "farmer", label: "Farmer (collector)", tex: t.coll, note: "scale ×3, flips when walking left" },
    { slug: "chef", label: "Chef", tex: t.chef, note: "kitchen stations, scale ×1.5–3" },
    ...t.customer.map((tex, i) => ({ slug: `customer-${i + 1}`, label: `Customer ${i + 1}`, tex, note: "walks in to order dishes, scale ×3" })),
    { slug: "customer-vip", label: "VIP guest", tex: t.vip, note: "greet to start a Dinner Rush, scale ×3" },
    { slug: "fox", label: "Night fox", tex: t.fox, note: "creeps up at night; tap to shoo, scale ×3" },
    { slug: "guard", label: "Night guard", tex: t.guard, note: "holds the patrol line at night, scale ×3" },
    { slug: "table", label: "Restaurant table", tex: t.table, note: "customers wait at these, scale ×3" },
    { slug: "waiter", label: "Waiter", tex: t.waiter, note: "runs plates counter → table, scale ×2.6" },
    { slug: "pan", label: "Pan", tex: t.pan, note: "station + kitchen tab icon" },
    { slug: "crate", label: "Pantry crate", tex: t.crate },
    ...STATIONS.map((st, i) => ({ slug: `dish-${st.name.toLowerCase()}`, label: `Dish: ${st.name}`, tex: t.dish[i] })),
    { slug: "icon-feather", label: "Feather (currency)", tex: t.icons.feather },
    { slug: "icon-speaker-on", label: "Speaker on", tex: t.icons.speakerOn },
    { slug: "icon-speaker-off", label: "Speaker off", tex: t.icons.speakerOff },
    { slug: "icon-bolt", label: "Bolt (speed)", tex: t.icons.bolt },
    { slug: "icon-clock", label: "Clock (schedule)", tex: t.icons.clock },
    { slug: "icon-wind", label: "Wind (collector speed)", tex: t.icons.wind },
    { slug: "icon-bag", label: "Bag (bigger bag)", tex: t.icons.bag },
    { slug: "icon-hands", label: "Hands (gentle hands)", tex: t.icons.hands },
    { slug: "icon-hay", label: "Hay tuft (roomier hay)", tex: t.icons.hay },
    { slug: "icon-hourglass", label: "Hourglass (fresh eggs)", tex: t.icons.hourglass },
    { slug: "icon-sweep", label: "Hand (wider sweep)", tex: t.icons.sweep },
    { slug: "icon-flame", label: "Flame (hot streak)", tex: t.icons.flame },
    { slug: "icon-coin", label: "Coin (midas flock)", tex: t.icons.coin },
    { slug: "icon-tag", label: "Tag (bulk deals)", tex: t.icons.tag },
    { slug: "icon-trophy", label: "Trophy (win screen)", tex: t.icons.trophy },
    { slug: "icon-star", label: "Star (perfect/rush)", tex: t.icons.star },
    { slug: "icon-gear", label: "Gear (settings)", tex: t.icons.gear },
    { slug: "icon-sun", label: "Sun (day clock)", tex: t.icons.sun },
    { slug: "icon-moon", label: "Moon (night clock)", tex: t.icons.moon },
    ...makeSwatches(app.renderer),
  ];

  document.title = "Egg Empire — graphics";
  // index.html locks the page down for the game (overflow hidden, no
  // selection, fixed wrap) — undo all of it so the gallery scrolls.
  document.documentElement.style.cssText = "overflow:auto;height:auto";
  document.body.style.cssText =
    "background:#1c2620;color:#e8e8e0;font:14px/1.4 system-ui;margin:0;padding:20px;" +
    "overflow:auto;height:auto;-webkit-user-select:auto;user-select:auto;overscroll-behavior:auto";
  const wrap = document.getElementById("wrap");
  if (wrap) wrap.style.display = "none";
  const head = document.createElement("div");
  head.innerHTML =
    "<h1 style='font-size:20px;margin:0 0 4px'>Egg Empire — every graphic in the game</h1>" +
    "<p style='margin:0 0 16px;opacity:.8'>Images are the real native-resolution PNGs (shown at 8×). " +
    "Click any tile to download it, draw a replacement at the same (or scaled-up) size, and hand the files back — " +
    "they're generated in <code>src/render/textures.ts</code> today and can be swapped for PNG assets.</p>";
  document.body.appendChild(head);

  // One-click sprite sheet: everything below on a single transparent PNG at
  // 4× (nearest-neighbour) with slug labels, for Photoshop/Aseprite work.
  // Cells are EQUALLY PITCHED (per section) with art anchored top-left, so
  // the whole sheet lines up on an editor grid — Dan's request.
  const items: { slug: string; url: string; w: number; h: number; swatch?: boolean }[] = [];
  const sheetBtn = document.createElement("button");
  sheetBtn.textContent = "Download ALL as one sprite-sheet PNG";
  sheetBtn.style.cssText =
    "font:14px/1 system-ui;padding:10px 16px;margin:0 0 18px;background:#2f6fdb;color:#fff;border:0;border-radius:8px;cursor:pointer";
  sheetBtn.addEventListener("click", () => {
    void (async () => {
      const SCALE = 4;
      const PAD = 16; //   gutter between cells; first cell origin is (PAD, header)
      const LABEL = 14; // label band at the bottom of every cell
      const HEAD = 22;
      const SHEET_W = 1600;
      const imgs = await Promise.all(
        items.map(
          (it) =>
            new Promise<HTMLImageElement>((res) => {
              const im = new Image();
              im.onload = () => res(im);
              im.src = it.url;
            }),
        ),
      );
      // Two uniform grids — sprites, then the big backdrop swatches — each
      // pitched to its largest member so every cell in a section is the same
      // size, art anchored top-left. No background fill: the sheet stays
      // transparent for image editors.
      interface Cell {
        it: (typeof items)[number];
        im: HTMLImageElement;
        x: number;
        y: number;
        cw: number;
        ch: number;
      }
      const cells: Cell[] = [];
      const heads: { s: string; y: number }[] = [];
      let y = PAD;
      for (const sec of [
        { title: "SPRITES", swatch: false },
        { title: "BACKDROPS (tiling swatches)", swatch: true },
      ]) {
        const list = items.map((it, i) => ({ it, im: imgs[i] })).filter((e) => !!e.it.swatch === sec.swatch);
        if (list.length === 0) continue;
        const cw = Math.max(...list.map((e) => e.it.w)) * SCALE;
        const ch = Math.max(...list.map((e) => e.it.h)) * SCALE + LABEL;
        const cols = Math.max(1, Math.floor((SHEET_W - PAD) / (cw + PAD)));
        const gy = y + HEAD;
        heads.push({ s: `${sec.title} · cell ${cw}×${ch}px · pitch ${cw + PAD}px · origin (${PAD}, ${gy})`, y: y + 12 });
        list.forEach((e, i) => {
          cells.push({
            ...e,
            x: PAD + (i % cols) * (cw + PAD),
            y: gy + Math.floor(i / cols) * (ch + PAD),
            cw,
            ch,
          });
        });
        y = gy + Math.ceil(list.length / cols) * (ch + PAD) + PAD;
      }
      const canvas = document.createElement("canvas");
      canvas.width = SHEET_W;
      canvas.height = y;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      // shadowed text so labels survive on any editor backdrop
      const text = (s: string, tx: number, ty: number): void => {
        ctx.fillStyle = "rgba(0,0,0,.75)";
        ctx.fillText(s, tx + 1, ty + 1);
        ctx.fillStyle = "#b9d3c3";
        ctx.fillText(s, tx, ty);
      };
      ctx.font = "bold 11px monospace";
      for (const h of heads) text(h.s, PAD, h.y);
      ctx.font = "10px monospace";
      for (const c of cells) {
        ctx.strokeStyle = "rgba(128,164,142,.4)"; // faint cell outline = the grid
        ctx.strokeRect(c.x - 0.5, c.y - 0.5, c.cw + 1, c.ch + 1);
        ctx.drawImage(c.im, c.x, c.y, c.it.w * SCALE, c.it.h * SCALE);
        text(c.it.slug, c.x + 2, c.y + c.ch - 4);
      }
      // toBlob + an in-document anchor: a synthetic click on a detached
      // anchor with a giant data: URL made Chrome ignore the filename and
      // save an extensionless UUID (Dan hit this).
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.download = "egg-empire-sprites.png";
        a.href = URL.createObjectURL(blob);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, "image/png");
    })();
  });
  document.body.appendChild(sheetBtn);

  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px";
  document.body.appendChild(grid);

  for (const e of entries) {
    const url = await app.renderer.extract.base64(e.tex);
    const w = Math.round(e.tex.width);
    const h = Math.round(e.tex.height);
    items.push({ slug: e.slug, url, w, h, swatch: e.swatch });
    const cell = document.createElement("a");
    cell.href = url;
    cell.download = `${e.slug}.png`;
    cell.style.cssText =
      "display:block;background:#26332b;border:2px solid #0d120d;padding:10px;text-decoration:none;color:inherit";
    const img = document.createElement("img");
    img.src = url;
    // cap at the card width — the 88px-wide backdrop tiles at a fixed 8×
    // (704px) blew out of their cells and shredded the grid (Dan's screenshot)
    img.style.cssText =
      `width:${w * 8}px;max-width:100%;height:auto;image-rendering:pixelated;display:block;margin:0 auto 8px;` +
      "background:repeating-conic-gradient(#2e3a33 0 25%,#26332b 0 50%) 0 0/16px 16px";
    const label = document.createElement("div");
    label.innerHTML = `<b>${e.label}</b><br><span style="opacity:.65">${e.slug}.png · ${w}×${h}px${e.note ? " · " + e.note : ""}</span>`;
    cell.append(img, label);
    grid.appendChild(cell);
  }
}

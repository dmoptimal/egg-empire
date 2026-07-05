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
}

/** Backdrop patterns from background.ts / kitchen.ts, as samplable swatches. */
function makeSwatches(renderer: Renderer): Entry[] {
  const gen = (draw: (g: Graphics) => void, slug: string, label: string, note?: string): Entry => {
    const g = new Graphics();
    draw(g);
    const tex = renderer.generateTexture({ target: g, textureSourceOptions: { scaleMode: "nearest" } });
    return { slug, label, tex, note };
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
    { slug: "basket", label: "Basket", tex: t.basket, note: "scale ×3.2; fill overlay drawn inside" },
    { slug: "truck", label: "Truck", tex: t.truck, note: "farm + kitchen trucks, scale ×3" },
    { slug: "farmer", label: "Farmer (collector)", tex: t.coll, note: "scale ×3, flips when walking left" },
    { slug: "chef", label: "Chef", tex: t.chef, note: "kitchen stations, scale ×1.5–3" },
    ...t.customer.map((tex, i) => ({ slug: `customer-${i + 1}`, label: `Customer ${i + 1}`, tex, note: "walks in to order dishes, scale ×3" })),
    { slug: "customer-vip", label: "VIP guest", tex: t.vip, note: "greet to start a Dinner Rush, scale ×3" },
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
    ...makeSwatches(app.renderer),
  ];

  document.title = "Egg Empire — graphics";
  document.body.style.cssText = "background:#1c2620;color:#e8e8e0;font:14px/1.4 system-ui;margin:0;padding:20px";
  const head = document.createElement("div");
  head.innerHTML =
    "<h1 style='font-size:20px;margin:0 0 4px'>Egg Empire — every graphic in the game</h1>" +
    "<p style='margin:0 0 16px;opacity:.8'>Images are the real native-resolution PNGs (shown at 8×). " +
    "Click any tile to download it, draw a replacement at the same (or scaled-up) size, and hand the files back — " +
    "they're generated in <code>src/render/textures.ts</code> today and can be swapped for PNG assets.</p>";
  document.body.appendChild(head);

  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px";
  document.body.appendChild(grid);

  for (const e of entries) {
    const url = await app.renderer.extract.base64(e.tex);
    const w = Math.round(e.tex.width);
    const h = Math.round(e.tex.height);
    const cell = document.createElement("a");
    cell.href = url;
    cell.download = `${e.slug}.png`;
    cell.style.cssText =
      "display:block;background:#26332b;border:2px solid #0d120d;padding:10px;text-decoration:none;color:inherit";
    const img = document.createElement("img");
    img.src = url;
    img.style.cssText =
      `width:${w * 8}px;height:${h * 8}px;image-rendering:pixelated;display:block;margin:0 auto 8px;` +
      "background:repeating-conic-gradient(#2e3a33 0 25%,#26332b 0 50%) 0 0/16px 16px";
    const label = document.createElement("div");
    label.innerHTML = `<b>${e.label}</b><br><span style="opacity:.65">${e.slug}.png · ${w}×${h}px${e.note ? " · " + e.note : ""}</span>`;
    cell.append(img, label);
    grid.appendChild(cell);
  }
}

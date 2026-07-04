// The layer stack. Order is a CLAUDE.md gotcha — back to front:
// bg, birds, eggs, baskets, collectors, trucks+labels, fx/popups,
// tree overlay, win screen, start screen, then the HUD chips on very top
// (they stay visible on every screen, like the DOM chips they replaced).

import { Container, Graphics } from "pixi.js";

export interface Layers {
  bg: Graphics;
  birds: Container;
  eggs: Container;
  baskets: Container;
  collectors: Container;
  trucks: Container;
  fx: Container;
  tree: Container;
  win: Container;
  start: Container;
  /** Bottom bar — above the screens so the title never hides the shop. */
  bar: Container;
  uiTop: Container;
}

export function createLayers(stage: Container): Layers {
  const layers: Layers = {
    bg: new Graphics(),
    birds: new Container(),
    eggs: new Container(),
    baskets: new Container(),
    collectors: new Container(),
    trucks: new Container(),
    fx: new Container(),
    tree: new Container(),
    win: new Container(),
    start: new Container(),
    bar: new Container(),
    uiTop: new Container(),
  };
  layers.tree.visible = false;
  layers.win.visible = false;
  stage.addChild(
    layers.bg,
    layers.birds,
    layers.eggs,
    layers.baskets,
    layers.collectors,
    layers.trucks,
    layers.fx,
    layers.tree,
    layers.win,
    layers.start,
    layers.bar,
    layers.uiTop,
  );
  return layers;
}

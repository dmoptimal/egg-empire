// The layer stack. Order is a CLAUDE.md gotcha — back to front:
// bg, birds, eggs, baskets, collectors, trucks+labels, fx/popups,
// tree overlay, win screen, start screen.

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
  );
  return layers;
}

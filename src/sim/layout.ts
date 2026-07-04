// Spatial layout as numbers. Gameplay depends on these (egg landing band,
// basket positions, truck travel), so the sim owns them; the render layer
// places sprites from the same values.

import {
  BASKET_X_FROM_RIGHT,
  BASKET_X_SPACING,
  BASKET_Y_OFFSET,
  HAY_BOTTOM_FROM_ROAD,
  HAY_TOP_RATIO,
  ROAD_Y_RATIO,
} from "../config/constants";
import type { Layout, SimState } from "./types";

export function computeLayout(w: number, h: number): Layout {
  const hayTop = h * HAY_TOP_RATIO;
  const roadY = h * ROAD_Y_RATIO;
  const hayBottom = roadY - HAY_BOTTOM_FROM_ROAD;
  const basketY = hayBottom + BASKET_Y_OFFSET;
  return { w, h, hayTop, hayBottom, roadY, basketY };
}

export function applyBasketXs(state: SimState): void {
  const w = state.layout.w;
  state.baskets.forEach((b, i) => {
    b.x = w - BASKET_X_FROM_RIGHT - i * BASKET_X_SPACING;
  });
}

/** Host calls this when the canvas size settles or changes. */
export function resize(state: SimState, w: number, h: number): void {
  state.layout = computeLayout(w, h);
  applyBasketXs(state);
}

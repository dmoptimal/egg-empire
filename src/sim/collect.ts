// Player collection: tap / swipe / hold all reduce to segment sweeps over the
// egg lists. Ported 1:1 from the prototype's collectSweep — including the
// early return when no basket has space (the rest of the sweep is abandoned).

import { FULL_WARN_COOLDOWN, SWEEP_RADIUS } from "../config/constants";
import { basketWithSpace } from "./baskets";
import { collectEgg } from "./eggs";
import { emit } from "./events";
import type { SimState } from "./types";

/** Squared distance from point (px,py) to segment (x1,y1)-(x2,y2). */
export function segDist2(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

/**
 * Sweep the segment (x1,y1)→(x2,y2) with the collection radius. A tap or a
 * held finger is a zero-length sweep. Fast flicks are fed in as segments so
 * they can't skip over eggs.
 */
export function sweepCollect(
  state: SimState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const r2 = SWEEP_RADIUS * SWEEP_RADIUS;
  for (let k = state.ground.length - 1; k >= 0; k--) {
    const e = state.ground[k];
    if (e.claimed) continue;
    if (segDist2(e.x, e.y, x1, y1, x2, y2) > r2) continue;
    const b = basketWithSpace(state, e.x);
    if (!b) {
      if (state.fullWarnCd <= 0) {
        state.fullWarnCd = FULL_WARN_COOLDOWN;
        emit(state, { type: "baskets-full" });
      }
      return;
    }
    collectEgg(state, e, b);
  }
  // Mid-air catches: falling/bouncing eggs are fair game once over the hay.
  for (let k = state.falling.length - 1; k >= 0; k--) {
    const e = state.falling[k];
    if (e.claimed || e.y < state.layout.hayTop) continue;
    if (segDist2(e.x, e.y, x1, y1, x2, y2) > r2) continue;
    const b = basketWithSpace(state, e.x);
    if (!b) return;
    collectEgg(state, e, b);
  }
}

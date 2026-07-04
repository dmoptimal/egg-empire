// Layout sanity for the Phase 3 sprawl (and every future layout change):
// nodes keep breathing room, every parent exists, and no edge polyline runs
// through a node it doesn't connect. Reposition freely — this test has your
// back (PLAN.md: "placing nodes where edges don't cross").

import { describe, expect, it } from "vitest";
import { edgePath, nodeById, NODES } from "./nodes";

const MIN_SPACING = 55; // node circles are r24 + level text
const EDGE_CLEARANCE = 26;

function segDist(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

describe("tree structure", () => {
  it("ids are unique and every parent exists", () => {
    expect(new Set(NODES.map((n) => n.id)).size).toBe(NODES.length);
    for (const n of NODES) if (n.par) expect(nodeById[n.par], `${n.id} parent`).toBeDefined();
  });

  it("exactly one root", () => {
    expect(NODES.filter((n) => n.par === null).map((n) => n.id)).toEqual(["sp0"]);
  });
});

describe("sprawl layout", () => {
  it(`no two nodes closer than ${MIN_SPACING}px`, () => {
    const violations: string[] = [];
    for (let i = 0; i < NODES.length; i++)
      for (let j = i + 1; j < NODES.length; j++) {
        const a = NODES[i];
        const b = NODES[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < MIN_SPACING) violations.push(`${a.id}↔${b.id}: ${Math.round(d)}px`);
      }
    expect(violations).toEqual([]);
  });

  it(`no edge passes within ${EDGE_CLEARANCE}px of an unrelated node`, () => {
    const violations: string[] = [];
    for (const n of NODES) {
      if (!n.par) continue;
      const path = edgePath(n);
      for (const other of NODES) {
        if (other.id === n.id || other.id === n.par) continue;
        for (let i = 0; i < path.length - 1; i++) {
          const d = segDist(other.x, other.y, path[i], path[i + 1]);
          if (d < EDGE_CLEARANCE)
            violations.push(`${n.par}→${n.id} passes ${Math.round(d)}px from ${other.id}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

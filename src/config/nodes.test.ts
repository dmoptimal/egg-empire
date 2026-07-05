// Layout sanity for the Phase 3 sprawl (and every future layout change):
// nodes keep breathing room, every parent exists, and no edge polyline runs
// through a node it doesn't connect. Reposition freely — this test has your
// back (PLAN.md: "placing nodes where edges don't cross").

import { describe, expect, it } from "vitest";
import { edgePath, nodeById, NODES } from "./nodes";

const MIN_SPACING = 80; // node circles are r24 + level text (Dan: spread it out)
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

  it("no two edges cross (Dan: 'make sure lines dont cross over')", () => {
    interface Pt {
      x: number;
      y: number;
    }
    const edges: { child: string; segs: [Pt, Pt][] }[] = [];
    for (const n of NODES) {
      if (!n.par) continue;
      const path = edgePath(n);
      const segs: [Pt, Pt][] = [];
      for (let i = 0; i < path.length - 1; i++)
        if (Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y) >= 1)
          segs.push([path[i], path[i + 1]]);
      edges.push({ child: n.id, segs });
    }
    const cross2 = (o: Pt, a: Pt, b: Pt): number =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const between = (a: Pt, b: Pt, c: Pt): boolean =>
      Math.min(a.x, b.x) - 1e-6 <= c.x &&
      c.x <= Math.max(a.x, b.x) + 1e-6 &&
      Math.min(a.y, b.y) - 1e-6 <= c.y &&
      c.y <= Math.max(a.y, b.y) + 1e-6;
    const segsCross = ([p, q]: [Pt, Pt], [r, s]: [Pt, Pt]): boolean => {
      const d1 = cross2(p, q, r);
      const d2 = cross2(p, q, s);
      const d3 = cross2(r, s, p);
      const d4 = cross2(r, s, q);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
        return true;
      if (Math.abs(d1) < 1e-6 && between(p, q, r)) return true;
      if (Math.abs(d2) < 1e-6 && between(p, q, s)) return true;
      if (Math.abs(d3) < 1e-6 && between(r, s, p)) return true;
      if (Math.abs(d4) < 1e-6 && between(r, s, q)) return true;
      return false;
    };
    const violations: string[] = [];
    for (let i = 0; i < edges.length; i++)
      for (let j = i + 1; j < edges.length; j++)
        for (const s1 of edges[i].segs)
          for (const s2 of edges[j].segs)
            if (segsCross(s1, s2)) violations.push(`${edges[i].child} × ${edges[j].child}`);
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

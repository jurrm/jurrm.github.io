import { SQRT3, pointSegmentDistance } from "./grid";

/**
 * Length-weighted centroid of a group's poly-line.
 *
 * This is the geometric centre of the *pipe*, not of its end-nodes, so it is
 * completely independent of how many interior nodes happen to sit on the run
 * (an intersection that adds a node no longer drags the anchor sideways) and
 * independent of orientation. Two congruent groups therefore always produce
 * an identically-placed balloon — the bug the old `mean(x)` + `max(y)` anchor
 * caused.
 *
 * @returns {{x:number,y:number}|null}
 */
export function groupCentroid(edgeIds, edgeById, pointsById) {
  let wsum = 0, cx = 0, cy = 0;
  for (const eid of edgeIds) {
    const e = edgeById[eid];
    if (!e) continue;
    const a = pointsById[e.a], b = pointsById[e.b];
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    cx += mx * len; cy += my * len; wsum += len;
  }
  if (!wsum) return null;
  return { x: cx / wsum, y: cy / wsum };
}

/** Fold any screen-angle (deg) into its "reads left-to-right / upright"
 *  representative in (-90, 90]. Keeps auto-aligned fittings predictable: a
 *  horizontal run → 0°, a vertical run → -90°, etc. */
function normAxis(a) {
  let x = ((a % 360) + 360) % 360;   // 0 … 360
  if (x > 90 && x <= 270) x -= 180;  // fold to the right-pointing half
  if (x > 270) x -= 360;             // -90 … 0
  return Math.round(x);
}

/**
 * Auto-alignment angle (degrees, SVG-clockwise) for a fitting placed on
 * `nodeId`, derived purely from the pipe lines already meeting that node — so
 * it works even when the fitting is dropped in long after the run was drawn,
 * and even at an intersection.
 *
 * Rule: if two of the incident lines are roughly collinear (a straight
 * through-run), align to that run. Otherwise align to the longest line at the
 * node (the dominant run, e.g. the through-leg of a tee or the single leg of
 * an end fitting). Symbols are authored with a horizontal flow axis, so the
 * returned angle is applied directly as the symbol's rotation.
 */
export function incidentAxisAngle(nodeId, edges, pointsById) {
  const here = pointsById[nodeId];
  if (!here) return 0;

  const arr = [];
  for (const e of edges) {
    if (e.a !== nodeId && e.b !== nodeId) continue;
    const o = pointsById[e.a === nodeId ? e.b : e.a];
    if (!o) continue;
    const dx = o.x - here.x, dy = o.y - here.y;
    arr.push({ ang: (Math.atan2(dy, dx) * 180) / Math.PI, len: Math.hypot(dx, dy) });
  }
  if (!arr.length) return 0;

  // 1) prefer a straight through-run (a pair ~180° apart)
  for (let m = 0; m < arr.length; m++)
    for (let n = m + 1; n < arr.length; n++) {
      const diff = Math.abs((((arr[m].ang - arr[n].ang) % 360) + 540) % 360 - 180);
      if (diff < 18) return normAxis(arr[m].ang);
    }

  // 2) otherwise align to the longest incident run
  arr.sort((p, q) => q.len - p.len);
  return normAxis(arr[0].ang);
}

/**
 * World-space bounding box of everything that will be drawn, padded for the
 * footprint of fitting symbols and the balloons that hang below groups/nodes.
 * Used by the print sheet to fit-and-centre the whole drawing.
 */
export function drawingBounds({
  pointsById, nodeMeta, groups, edgeById, symDiameter, balloonDrop,
}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const p of Object.values(pointsById)) {
    const half = nodeMeta[p.id]?.symbolId ? symDiameter / 2 : 6;
    add(p.x - half, p.y - half);
    add(p.x + half, p.y + half);
  }
  for (const g of groups) {
    const c = groupCentroid(g.edgeIds, edgeById, pointsById);
    if (c) { add(c.x, c.y); add(c.x, c.y + balloonDrop); }
  }
  for (const [nid, meta] of Object.entries(nodeMeta)) {
    if (!meta.bomItemId) continue;
    const p = pointsById[nid];
    if (p) add(p.x, p.y + balloonDrop);
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Generate the three iso grid-line families covering the world rectangle
 * [wl,wr] × [wt,wb]. Shared so the print sheet shows the same grid the canvas
 * does.
 */
export function isoGridLines(wl, wt, wr, wb, geom) {
  const verticals = [];
  for (let i = Math.floor(wl / geom.dx) - 1; i <= Math.ceil(wr / geom.dx) + 1; i++) {
    const x = i * geom.dx;
    verticals.push({ id: `v${i}`, x1: x, y1: wt, x2: x, y2: wb });
  }
  const corners = [[wl, wt], [wr, wt], [wl, wb], [wr, wb]];
  const d1V = corners.map(([x, y]) => (y + x / SQRT3) / geom.s);
  const d2V = corners.map(([x, y]) => (y - x / SQRT3) / geom.s);
  const d1 = [], d2 = [];
  for (let m = Math.floor(Math.min(...d1V)) - 1; m <= Math.ceil(Math.max(...d1V)) + 1; m++)
    d1.push({ id: `d1_${m}`, x1: wl, y1: -wl / SQRT3 + m * geom.s, x2: wr, y2: -wr / SQRT3 + m * geom.s });
  for (let m = Math.floor(Math.min(...d2V)) - 1; m <= Math.ceil(Math.max(...d2V)) + 1; m++)
    d2.push({ id: `d2_${m}`, x1: wl, y1: wl / SQRT3 + m * geom.s, x2: wr, y2: wr / SQRT3 + m * geom.s });
  return { verticals, d1, d2 };
}

/* ── balloon collision-avoidance ──────────────────────────────────── */

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false; // parallel / degenerate
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Minimum distance between two line segments (0 if they cross). */
function segSegDistance(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    pointSegmentDistance(ax, ay, cx, cy, dx, dy),
    pointSegmentDistance(bx, by, cx, cy, dx, dy),
    pointSegmentDistance(cx, cy, ax, ay, bx, by),
    pointSegmentDistance(dx, dy, ax, ay, bx, by),
  );
}

/**
 * Decide where each BOM balloon hangs so it never covers a pipe, a fitting,
 * or another balloon.
 *
 * Each balloon prefers to drop straight DOWN from its anchor (the long-
 * standing convention). If that would land on top of a line / fitting /
 * another balloon, it tries sideways (right, left), then up, then the four
 * diagonals — taking the first collision-free option in that priority order,
 * or, if the drawing is so dense that nothing is fully clear, the least-bad
 * one. All maths is in world space; callers pass world-space sizes (so the
 * same routine serves both the zoomable canvas and the fixed print sheet).
 *
 * @param items  [{ key, cx, cy, label, isSel?, anchorNodeId? }]
 * @returns each item augmented with { dx, dy, bx, by, sx1, sy1, sx2, sy2 }
 *          — balloon centre (bx,by) and leader stem (sx1,sy1)→(sx2,sy2).
 */
export function placeBalloons({
  items, edges, pointsById, nodeMeta, symHalf, R, gap, stem, clearance = 3,
}) {
  const segs = [];
  for (const e of edges) {
    const a = pointsById[e.a], b = pointsById[e.b];
    if (a && b) segs.push([a.x, a.y, b.x, b.y]);
  }
  const fittings = [];
  for (const [nid, m] of Object.entries(nodeMeta)) {
    if (!m.symbolId) continue;
    const p = pointsById[nid];
    if (p) fittings.push({ id: nid, x: p.x, y: p.y, r: symHalf });
  }

  const S = Math.SQRT1_2;
  // priority order: down → sideways → up → diagonals
  const DIRS = [
    [0, 1], [1, 0], [-1, 0], [0, -1],
    [S, S], [-S, S], [S, -S], [-S, -S],
  ];

  const placed = []; // balloon circles already committed: {x,y}
  const out = [];

  for (const it of items) {
    // `anchorPad` pushes the whole leader+balloon outward past a fitting symbol
    // so the number never sits on top of a large valve. 0 for plain pipe nodes.
    const pad = it.anchorPad || 0;
    const reach = pad + gap + stem + R;
    let best = null, bestPen = Infinity;

    for (let di = 0; di < DIRS.length; di++) {
      const [dx, dy] = DIRS[di];
      const bx = it.cx + dx * reach, by = it.cy + dy * reach;
      const sx1 = it.cx + dx * (pad + gap), sy1 = it.cy + dy * (pad + gap);
      const sx2 = it.cx + dx * (pad + gap + stem), sy2 = it.cy + dy * (pad + gap + stem);

      let pen = di * 0.001; // tiny bias → keep the preferred direction on ties

      for (const s of segs) {
        const dc = pointSegmentDistance(bx, by, s[0], s[1], s[2], s[3]);
        if (dc < R + clearance) pen += (R + clearance - dc) + 100; // circle on a pipe
        const dStem = segSegDistance(sx1, sy1, sx2, sy2, s[0], s[1], s[2], s[3]);
        if (dStem < clearance) pen += (clearance - dStem) + 60;     // stem crosses a pipe
      }
      for (const ft of fittings) {
        if (ft.id === it.anchorNodeId) continue; // ok to point at its own fitting
        const dd = Math.hypot(bx - ft.x, by - ft.y);
        if (dd < R + ft.r + clearance) pen += (R + ft.r + clearance - dd) + 120;
      }
      for (const pb of placed) {
        const dd = Math.hypot(bx - pb.x, by - pb.y);
        if (dd < 2 * R + clearance) pen += (2 * R + clearance - dd) + 80;
      }

      if (pen < bestPen) {
        bestPen = pen;
        best = { dx, dy, bx, by, sx1, sy1, sx2, sy2 };
      }
      if (pen < 0.01) break; // collision-free at a preferred direction → done
    }

    placed.push({ x: best.bx, y: best.by });
    out.push({ ...it, ...best });
  }

  return out;
}

export const SQRT3 = Math.sqrt(3);

export function makeGeometry(isMobile) {
  const s = isMobile ? 42 : 56;
  return { s, dx: (s * SQRT3) / 2, dy: s / 2 };
}

export const AXES = [
  { name: "N",    axis: "X", di: 1,  dj: 1  },
  { name: "S",    axis: "X", di: -1, dj: -1 },
  { name: "W",    axis: "Y", di: -1, dj: 1  },
  { name: "E",    axis: "Y", di: 1,  dj: -1 },
  { name: "UP",   axis: "Z", di: 0,  dj: 2  },
  { name: "DOWN", axis: "Z", di: 0,  dj: -2 },
];

export const STEP_45 = [
  { di: 1,  dj: 3  },
  { di: -1, dj: -3 },
  { di: -1, dj: 3  },
  { di: 1,  dj: -3 },
  { di: 2,  dj: 0  },
  { di: -2, dj: 0  },
];

const ALL_STEPS = [...AXES, ...STEP_45];

export function isConnectable(a, b) {
  const di = b.i - a.i;
  const dj = b.j - a.j;
  return ALL_STEPS.some((d) => d.di === di && d.dj === dj);
}

export const latticeKey = (i, j) => `${i},${j}`;
export const parseLatticeKey = (k) => {
  const [i, j] = k.split(",").map(Number);
  return { i, j };
};

export function nearestLattice(wx, wy, geom) {
  const i = Math.round(wx / geom.dx);
  const jApprox = -wy / geom.dy;
  let j = Math.round(jApprox);
  if ((i + j) % 2 !== 0) {
    j = Math.abs(jApprox - (j + 1)) < Math.abs(jApprox - (j - 1)) ? j + 1 : j - 1;
  }
  const x = i * geom.dx;
  const y = -j * geom.dy;
  return { i, j, x, y, dist: Math.hypot(wx - x, wy - y) };
}

/** Shortest distance from point (px,py) to segment (ax,ay)–(bx,by). */
export function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Check whether a list of edge objects [{a,b}, …] forms a single
 * connected component.  Returns false for an empty list.
 */
export function areEdgesConnected(edgeList) {
  if (!edgeList.length) return false;
  if (edgeList.length === 1) return true;
  const adj = new Map();
  const push = (u, v) => {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u).push(v);
  };
  for (const { a, b } of edgeList) { push(a, b); push(b, a); }
  const nodes = [...adj.keys()];
  const visited = new Set([nodes[0]]);
  const queue = [nodes[0]];
  while (queue.length) {
    const n = queue.shift();
    for (const nb of adj.get(n)) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  return visited.size === nodes.length;
}
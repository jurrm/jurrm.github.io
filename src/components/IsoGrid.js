import { useEffect, useRef, useState } from "react";
import Compass from "./Compass";
import BomPanel from "./BomPanel";
import PrintSheet from "./PrintSheet";
import { SYMBOL_BY_ID, FittingGlyph } from "../lib/symbols";
import {
  SQRT3, makeGeometry, nearestLattice, isConnectable,
  latticeKey, parseLatticeKey, pointSegmentDistance, areEdgesConnected,
} from "../lib/grid";
import { groupCentroid, incidentAxisAngle, placeBalloons } from "../lib/iso";

const MIN_SCALE = 0.3, MAX_SCALE = 4, DRAG_THRESHOLD = 5;
const C_LINE = "#2563eb", C_LINE_HI = "#3b82f6", C_SEL = "#f59e0b", C_NODE = "#1d4ed8";

export default function IsoGrid() {
  const [size, setSize] = useState(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });

  const [pointsById, setPointsById] = useState({});
  const [edges, setEdges] = useState([]);            // { id, a, b }
  const [groups, setGroups] = useState([]);          // { id, edgeIds, bomItemId }
  const [bomItems, setBomItems] = useState([]);      // { id, size, rating, spec, description }
  const [nodeMeta, setNodeMeta] = useState({});      // { nodeId: { symbolId?, rotation?, bomItemId? } }

  const [mode, setMode] = useState("draw");
  const [currentId, setCurrentId] = useState(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [showSheet, setShowSheet] = useState(false);

  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const nextIdRef = useRef(1);
  const uid = () => nextIdRef.current++;

  useEffect(() => {
    const update = () => setSize((prev) => {
      const w = window.innerWidth, h = window.innerHeight;
      if (!prev) setView({ scale: 1, tx: w / 2, ty: h / 2 });
      return { w, h };
    });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!size) return <div className="fixed inset-0 bg-white" />;

  const { w, h } = size;
  const isMobile = w < 640;
  const geom = makeGeometry(isMobile);
  const { scale, tx, ty } = view;
  const hitRadius = (isMobile ? 22 : 24) / scale;
  const nodeRadius = (isMobile ? 18 : 16) / scale;

  const toWorld = (sx, sy) => [(sx - tx) / scale, (sy - ty) / scale];
  const [wl, wt] = toWorld(0, 0);
  const [wr, wb] = toWorld(w, h);
  const localCoords = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  /* lookups */
  const edgeById = {};
  for (const e of edges) edgeById[e.id] = e;
  const groupByEdgeId = {};
  for (const g of groups) for (const eid of g.edgeIds) groupByEdgeId[eid] = g;

  const findLatticePoint = (key) =>
    Object.values(pointsById).find((p) => p.latticeKey === key) || null;
  const edgeExists = (a, b) =>
    edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const findNodeNear = (wx, wy) => {
    let best = null, bd = nodeRadius;
    for (const p of Object.values(pointsById)) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  const findEdgeNear = (wx, wy) => {
    let best = null, bd = hitRadius;
    for (const e of edges) {
      const a = pointsById[e.a], b = pointsById[e.b];
      if (!a || !b) continue;
      const d = pointSegmentDistance(wx, wy, a.x, a.y, b.x, b.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  /* ── draw mode ─────────────────────────────────────────────── */
  function placeAtLattice(p) {
    const key = latticeKey(p.i, p.j);
    const existing = findLatticePoint(key);
    const id = existing ? existing.id : `n${uid()}`;
    if (!existing)
      setPointsById((prev) => ({ ...prev, [id]: { id, x: p.x, y: p.y, latticeKey: key } }));
    if (!currentId) { setCurrentId(id); return; }
    if (id === currentId) return;
    const cur = pointsById[currentId];
    if (cur?.latticeKey &&
        isConnectable(parseLatticeKey(cur.latticeKey), { i: p.i, j: p.j }) &&
        !edgeExists(currentId, id))
      setEdges((prev) => [...prev, { id: `e${uid()}`, a: currentId, b: id }]);
    setCurrentId(id);
  }

  /* ── select mode ───────────────────────────────────────────── */
  function tapSelect(wx, wy) {
    // nodes win when tapped directly
    const node = findNodeNear(wx, wy);
    if (node) {
      setSelectedEdgeIds([]);
      setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
      return;
    }
    const e = findEdgeNear(wx, wy);
    if (!e) { setSelectedEdgeIds([]); setSelectedNodeId(null); return; }
    setSelectedNodeId(null);

    const grp = groupByEdgeId[e.id];
    const unit = grp ? grp.edgeIds : [e.id];

    setSelectedEdgeIds((prev) => {
      const prevSet = new Set(prev);
      const allIn = unit.every((id) => prevSet.has(id));
      if (allIn) { for (const id of unit) prevSet.delete(id); return [...prevSet]; }
      if (prev.length === 0) return [...new Set(unit)];

      // only extend the selection if the new unit shares a node with it
      const selNodes = new Set();
      for (const id of prev) { const ed = edgeById[id]; if (ed) { selNodes.add(ed.a); selNodes.add(ed.b); } }
      let shares = false;
      for (const id of unit) {
        const ed = edgeById[id];
        if (ed && (selNodes.has(ed.a) || selNodes.has(ed.b))) { shares = true; break; }
      }
      if (shares) { const m = new Set(prev); for (const id of unit) m.add(id); return [...m]; }
      return [...new Set(unit)]; // disconnected → start fresh
    });
  }

  /* derived selection */
  const selectedEdgeSet = new Set(selectedEdgeIds);
  const fullySelectedGroupIds = groups
    .filter((g) => g.edgeIds.length && g.edgeIds.every((id) => selectedEdgeSet.has(id)))
    .map((g) => g.id);
  const fullySelectedGroupSet = new Set(fullySelectedGroupIds);
  const hasGroupsSel = fullySelectedGroupIds.length > 0;
  const hasNodeSel = !!selectedNodeId;
  const canAssign = hasNodeSel || hasGroupsSel;
  const canGroup = selectedEdgeIds.length >= 1 &&
    areEdgesConnected(selectedEdgeIds.map((id) => edgeById[id]).filter(Boolean));

  const selectedNodeMeta = selectedNodeId ? nodeMeta[selectedNodeId] : null;
  const selectedNodeSymbolId = selectedNodeMeta?.symbolId || null;

  const selectedBomItemIds = [];
  if (selectedNodeId && nodeMeta[selectedNodeId]?.bomItemId)
    selectedBomItemIds.push(nodeMeta[selectedNodeId].bomItemId);
  for (const gid of fullySelectedGroupIds) {
    const g = groups.find((x) => x.id === gid);
    if (g?.bomItemId) selectedBomItemIds.push(g.bomItemId);
  }

  const selectedNodeIds = new Set();
  for (const id of selectedEdgeIds) {
    const e = edgeById[id];
    if (e) { selectedNodeIds.add(e.a); selectedNodeIds.add(e.b); }
  }

  /* ── group / ungroup / delete ──────────────────────────────── */
  function groupSelected() {
    if (!canGroup) return;
    const sel = new Set(selectedEdgeIds);
    const newId = `g${uid()}`;
    setGroups((prev) => {
      const cleaned = prev
        .map((g) => ({ ...g, edgeIds: g.edgeIds.filter((id) => !sel.has(id)) }))
        .filter((g) => g.edgeIds.length);
      return [...cleaned, { id: newId, edgeIds: [...selectedEdgeIds], bomItemId: null }];
    });
  }
  function ungroupSelected() {
    if (!fullySelectedGroupIds.length) return;
    setGroups((prev) => prev.filter((g) => !fullySelectedGroupSet.has(g.id)));
  }
  function pointKeeper(usedNodeSet, meta) {
    return (id) => usedNodeSet.has(id) || (meta[id] && (meta[id].symbolId || meta[id].bomItemId));
  }
  function deleteSelected() {
    if (!selectedEdgeIds.length) return;
    const del = new Set(selectedEdgeIds);
    const remaining = edges.filter((e) => !del.has(e.id));
    const used = new Set(remaining.flatMap((e) => [e.a, e.b]));
    setEdges(remaining);
    setGroups((prev) => prev
      .map((g) => ({ ...g, edgeIds: g.edgeIds.filter((id) => !del.has(id)) }))
      .filter((g) => g.edgeIds.length));
    setPointsById((prev) => {
      const keep = pointKeeper(used, nodeMeta), next = {};
      for (const [id, p] of Object.entries(prev)) if (keep(id)) next[id] = p;
      return next;
    });
    setSelectedEdgeIds([]);
  }
  function deleteSelectedNode() {
    const nid = selectedNodeId;
    if (!nid) return;
    const removed = new Set(edges.filter((e) => e.a === nid || e.b === nid).map((e) => e.id));
    const remaining = edges.filter((e) => !removed.has(e.id));
    const used = new Set(remaining.flatMap((e) => [e.a, e.b]));
    const meta = { ...nodeMeta }; delete meta[nid];
    setEdges(remaining);
    setGroups((prev) => prev
      .map((g) => ({ ...g, edgeIds: g.edgeIds.filter((id) => !removed.has(id)) }))
      .filter((g) => g.edgeIds.length));
    setNodeMeta(meta);
    setPointsById((prev) => {
      const keep = pointKeeper(used, meta), next = {};
      for (const [id, p] of Object.entries(prev)) if (id !== nid && keep(id)) next[id] = p;
      return next;
    });
    setSelectedNodeId(null);
  }

  /* ── fittings ──────────────────────────────────────────────── */
  function pickSymbol(symbolId) {
    if (!selectedNodeId) return;
    setNodeMeta((prev) => {
      const cur = prev[selectedNodeId] || {};
      // Fresh fitting → auto-align to the pipe run at this node.
      // Switching the symbol on an existing fitting → keep its orientation.
      const rotation = cur.symbolId != null
        ? (cur.rotation || 0)
        : incidentAxisAngle(selectedNodeId, edges, pointsById);
      return { ...prev, [selectedNodeId]: { ...cur, symbolId, rotation } };
    });
  }
  function alignFitting() {
    if (!selectedNodeId) return;
    setNodeMeta((prev) => {
      const cur = prev[selectedNodeId];
      if (!cur?.symbolId) return prev;
      return { ...prev, [selectedNodeId]: { ...cur, rotation: incidentAxisAngle(selectedNodeId, edges, pointsById) } };
    });
  }
  function rotateFitting(delta) {
    if (!selectedNodeId) return;
    setNodeMeta((prev) => {
      const cur = prev[selectedNodeId]; if (!cur?.symbolId) return prev;
      return { ...prev, [selectedNodeId]: { ...cur, rotation: (((cur.rotation || 0) + delta) % 360 + 360) % 360 } };
    });
  }
  function removeFitting() {
    if (!selectedNodeId) return;
    setNodeMeta((prev) => {
      const cur = { ...prev[selectedNodeId] };
      delete cur.symbolId; delete cur.rotation;
      const next = { ...prev };
      if (cur.bomItemId) next[selectedNodeId] = cur; else delete next[selectedNodeId];
      return next;
    });
  }

  /* ── BOM ───────────────────────────────────────────────────── */
  function addBomItem() {
    setBomItems((p) => [...p, { id: `b${uid()}`, size: "", rating: "", spec: "", description: "" }]);
  }
  function updateBomItem(id, field, val) {
    setBomItems((p) => p.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  }
  function deleteBomItem(id) {
    setBomItems((p) => p.filter((b) => b.id !== id));
    setGroups((p) => p.map((g) => (g.bomItemId === id ? { ...g, bomItemId: null } : g)));
    setNodeMeta((p) => {
      const n = { ...p };
      for (const k of Object.keys(n)) if (n[k].bomItemId === id) n[k] = { ...n[k], bomItemId: null };
      return n;
    });
  }
  function assignToBom(bomItemId) {
    if (selectedNodeId) {
      setNodeMeta((prev) => {
        const cur = prev[selectedNodeId] || {};
        const next = cur.bomItemId === bomItemId ? null : bomItemId; // tap again → unassign
        return { ...prev, [selectedNodeId]: { ...cur, bomItemId: next } };
      });
    } else if (fullySelectedGroupIds.length) {
      setGroups((prev) => prev.map((g) =>
        (fullySelectedGroupSet.has(g.id)
          ? { ...g, bomItemId: g.bomItemId === bomItemId ? null : bomItemId } // tap again → unassign
          : g)));
    }
  }

  const qtyByItem = {};
  for (const g of groups) if (g.bomItemId) qtyByItem[g.bomItemId] = (qtyByItem[g.bomItemId] || 0) + 1;
  for (const m of Object.values(nodeMeta)) if (m.bomItemId) qtyByItem[m.bomItemId] = (qtyByItem[m.bomItemId] || 0) + 1;

  /* ── tap dispatch ──────────────────────────────────────────── */
  function handleTap(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    if (mode === "draw") {
      const p = nearestLattice(wx, wy, geom);
      if (p.dist < hitRadius) placeAtLattice(p);
    } else tapSelect(wx, wy);
  }
  function switchMode(m) {
    setMode(m); setHovered(null); setHoveredEdgeId(null);
    if (m === "draw") { setSelectedEdgeIds([]); setSelectedNodeId(null); }
    else setCurrentId(null);
  }

  /* ── pointer / pan / pinch ─────────────────────────────────── */
  function onPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = localCoords(e);
    pointers.current.set(e.pointerId, { x, y });
    if (pointers.current.size === 1)
      gesture.current = { mode: "maybe-click", startX: x, startY: y };
    else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      gesture.current = { mode: "pinch", startDist: dist, startScale: scale, startTx: tx, startTy: ty, mid };
      setHovered(null); setHoveredEdgeId(null);
    }
  }
  function onPointerMove(e) {
    const [x, y] = localCoords(e);
    const g = gesture.current;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x, y });
    if (g?.mode === "pinch" && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.startScale * (dist / g.startDist)));
      const wx = (g.mid.x - g.startTx) / g.startScale, wy = (g.mid.y - g.startTy) / g.startScale;
      setView({ scale: ns, tx: g.mid.x - wx * ns, ty: g.mid.y - wy * ns });
      return;
    }
    if (g && (g.mode === "maybe-click" || g.mode === "pan")) {
      const dm = Math.hypot(x - g.startX, y - g.startY);
      if (g.mode === "maybe-click" && dm > DRAG_THRESHOLD) {
        g.mode = "pan"; g.baseTx = tx; g.baseTy = ty; setHovered(null); setHoveredEdgeId(null);
      }
      if (g.mode === "pan") {
        setView((v) => ({ ...v, tx: g.baseTx + (x - g.startX), ty: g.baseTy + (y - g.startY) }));
        return;
      }
    }
    if (e.pointerType === "mouse" && (!g || g.mode === "maybe-click")) {
      const [wx, wy] = toWorld(x, y);
      if (mode === "draw") {
        const p = nearestLattice(wx, wy, geom);
        setHovered(p.dist < hitRadius ? p : null);
      } else {
        if (findNodeNear(wx, wy)) setHoveredEdgeId(null);
        else { const ed = findEdgeNear(wx, wy); setHoveredEdgeId(ed?.id ?? null); }
      }
    }
  }
  function onPointerUp(e) {
    const [x, y] = localCoords(e);
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (g?.mode === "maybe-click") handleTap(x, y);
    if (pointers.current.size === 0) gesture.current = null;
    if (e.pointerType !== "mouse") { setHovered(null); setHoveredEdgeId(null); }
  }
  function onWheel(e) {
    const [mx, my] = localCoords(e);
    const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * Math.exp(-e.deltaY * 0.0015)));
    const wx = (mx - tx) / scale, wy = (my - ty) / scale;
    setView({ scale: ns, tx: mx - wx * ns, ty: my - wy * ns });
  }

  /* ── grid lines ────────────────────────────────────────────── */
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

  /* ── hidden interior nodes (degree rule) ───────────────────── */
  const globalDegree = {};
  for (const e of edges) {
    globalDegree[e.a] = (globalDegree[e.a] || 0) + 1;
    globalDegree[e.b] = (globalDegree[e.b] || 0) + 1;
  }
  const hiddenNodeIds = new Set();
  for (const g of groups) {
    const gd = {};
    for (const eid of g.edgeIds) {
      const e = edgeById[eid]; if (!e) continue;
      gd[e.a] = (gd[e.a] || 0) + 1; gd[e.b] = (gd[e.b] || 0) + 1;
    }
    for (const [nodeId, deg] of Object.entries(gd))
      if (deg >= 2 && (globalDegree[nodeId] || 0) === deg) hiddenNodeIds.add(nodeId);
  }

  /* ── balloons (centroid-anchored, collision-avoiding) ──────── */
  const SYM_D = geom.s * 1.5; // symbol world-size
  const R = 11 / scale, GAP = 9 / scale, STEM = 13 / scale;
  const balloonItems = [];
  for (const g of groups) {
    const c = groupCentroid(g.edgeIds, edgeById, pointsById);
    if (!c) continue;
    const idx = g.bomItemId ? bomItems.findIndex((b) => b.id === g.bomItemId) : -1;
    balloonItems.push({ key: g.id, cx: c.x, cy: c.y,
      label: idx >= 0 ? String(idx + 1) : "–", isSel: fullySelectedGroupSet.has(g.id) });
  }
  for (const [nid, meta] of Object.entries(nodeMeta)) {
    if (!meta.bomItemId) continue;
    const p = pointsById[nid]; if (!p) continue;
    const idx = bomItems.findIndex((b) => b.id === meta.bomItemId);
    if (idx < 0) continue;
    balloonItems.push({ key: `nb${nid}`, cx: p.x, cy: p.y, label: String(idx + 1),
      isSel: selectedNodeId === nid, anchorNodeId: nid,
      anchorPad: meta.symbolId ? SYM_D * 0.32 : 0 }); // clear the fitting symbol
  }
  const balloons = placeBalloons({
    items: balloonItems, edges, pointsById, nodeMeta,
    symHalf: SYM_D * 0.3, R, gap: GAP, stem: STEM, clearance: 3 / scale,
  });


  /* ── render ────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 bg-white overflow-hidden select-none">
      <svg width={w} height={h} className="block touch-none cursor-crosshair"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={() => { setHovered(null); setHoveredEdgeId(null); }}
        onWheel={onWheel}>
        <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          <g stroke="#e5e7eb" strokeWidth="1">
            {verticals.map((l) => <line key={l.id} {...l} vectorEffect="non-scaling-stroke" />)}
            {d1.map((l) => <line key={l.id} {...l} vectorEffect="non-scaling-stroke" />)}
            {d2.map((l) => <line key={l.id} {...l} vectorEffect="non-scaling-stroke" />)}
          </g>

          {/* edges */}
          {edges.filter((e) => !selectedEdgeSet.has(e.id)).map((e) => {
            const a = pointsById[e.a], b = pointsById[e.b]; if (!a || !b) return null;
            const hov = e.id === hoveredEdgeId;
            return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={hov ? C_LINE_HI : C_LINE} strokeWidth={hov ? 3.5 : 2.5}
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
          })}
          {edges.filter((e) => selectedEdgeSet.has(e.id)).map((e) => {
            const a = pointsById[e.a], b = pointsById[e.b]; if (!a || !b) return null;
            return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={C_SEL} strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
          })}

          {/* nodes */}
          {Object.values(pointsById).map((p) => {
            if (hiddenNodeIds.has(p.id)) return null;
            if (nodeMeta[p.id]?.symbolId) return null;     // covered by symbol
            const isCur = p.id === currentId && mode === "draw";
            const isSel = selectedNodeIds.has(p.id);
            return (
              <g key={p.id}>
                {isSel && <circle cx={p.x} cy={p.y} r={9 / scale} fill="none"
                  stroke={C_SEL} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
                <circle cx={p.x} cy={p.y} r={(isCur ? 6 : 4) / scale}
                  fill={isCur ? C_LINE : C_NODE} />
              </g>
            );
          })}

          {/* fitting symbols — masked solid (no line showing through),
              same colour as the pipe, drawn after the edges so they overlay */}
          {Object.entries(nodeMeta).map(([nid, meta]) => {
            if (!meta.symbolId) return null;
            const p = pointsById[nid]; const sym = SYMBOL_BY_ID[meta.symbolId];
            if (!p || !sym) return null;
            return (
              <FittingGlyph key={`fit${nid}`} symbol={sym} x={p.x} y={p.y}
                rotation={meta.rotation || 0} size={SYM_D}
                color={C_LINE} strokeWidth={2.5} maskColor="#ffffff" />
            );
          })}

          {/* selected-node ring (on top of symbol) */}
          {selectedNodeId && pointsById[selectedNodeId] && (() => {
            const p = pointsById[selectedNodeId];
            const hasSym = !!nodeMeta[selectedNodeId]?.symbolId;
            return <circle cx={p.x} cy={p.y} r={hasSym ? geom.s * 0.6 : 10 / scale}
              fill="none" stroke={C_SEL} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />;
          })()}

          {/* balloons — placed to avoid covering pipes / fittings / each other */}
          {balloons.map((b) => (
            <g key={b.key} pointerEvents="none">
              <line x1={b.sx1} y1={b.sy1} x2={b.sx2} y2={b.sy2} stroke="#333"
                strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              <circle cx={b.bx} cy={b.by} r={R} fill="white"
                stroke={b.isSel ? C_SEL : "#333"} strokeWidth={b.isSel ? 2.5 : 1.5}
                vectorEffect="non-scaling-stroke" />
              <text x={b.bx} y={b.by} textAnchor="middle" dominantBaseline="central"
                fontSize={13 / scale} fontWeight="700" fill="#111">{b.label}</text>
            </g>
          ))}

          {hovered && mode === "draw" && (
            <circle cx={hovered.x} cy={hovered.y} r={6 / scale}
              fill="#60a5fa" fillOpacity="0.85" pointerEvents="none" />
          )}
        </g>
      </svg>

      <Compass />

      <BomPanel
        mode={mode}
        onModeChange={switchMode}
        selectedEdgeCount={selectedEdgeIds.length}
        hasNodeSel={hasNodeSel}
        selectedNodeHasSymbol={!!selectedNodeSymbolId}
        selectedNodeSymbolId={selectedNodeSymbolId}
        canGroup={canGroup}
        hasGroupsSel={hasGroupsSel}
        canAssign={canAssign}
        selectedBomItemIds={selectedBomItemIds}
        bomItems={bomItems}
        qtyByItem={qtyByItem}
        hasDrawing={edges.length > 0}
        onGroup={groupSelected}
        onUngroup={ungroupSelected}
        onDelete={deleteSelected}
        onDeleteNode={deleteSelectedNode}
        onPickSymbol={pickSymbol}
        onRotate={rotateFitting}
        onAlign={alignFitting}
        onRemoveFitting={removeFitting}
        onAddItem={addBomItem}
        onUpdateItem={updateBomItem}
        onDeleteItem={deleteBomItem}
        onAssign={assignToBom}
        onOpenSheet={() => setShowSheet(true)}
      />

      {showSheet && (
        <PrintSheet
          onClose={() => setShowSheet(false)}
          pointsById={pointsById}
          edges={edges}
          edgeById={edgeById}
          groups={groups}
          bomItems={bomItems}
          nodeMeta={nodeMeta}
          qtyByItem={qtyByItem}
          geom={geom}
          symD={SYM_D}
        />
      )}
    </div>
  );
}
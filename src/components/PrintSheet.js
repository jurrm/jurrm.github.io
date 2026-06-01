import { useMemo, useState } from "react";
import { SYMBOL_BY_ID, FittingGlyph } from "../lib/symbols";
import { groupCentroid, drawingBounds, isoGridLines, placeBalloons } from "../lib/iso";

/* US-Letter landscape @ 96 dpi — the working size of the SVG sheet. */
const SHEET_W = 1056, SHEET_H = 816;
const FRAME = 12, INSET = 6;          // double outer border
const DRAW_FRAC = 0.62;               // drawing column share of the content width
const PAD = 26;                       // breathing room around the drawing
const BALLOON_RESERVE = 50;           // bottom space kept clear for hanging balloons
const FMAX = 2.6;                     // never blow a tiny drawing up past this
const TITLE_H = 150;                  // title-block height (bottom of right column)
const INK = "#111827";                // single ink colour: lines == symbols
const GRID = "#d7dbe0";
const SANS = "Arial, Helvetica, sans-serif";

const HEAD_BAR_H = 26;
const BODY_FS = 9, HEAD_FS = 8;       // base font sizes (auto-shrunk to fit)
const CELL_PAD = 5, V_PAD = 5;

const COLS = [
  { key: "no",   label: "ITEM", f: 0.09, align: "middle" },
  { key: "qty",  label: "QTY",  f: 0.09, align: "middle" },
  { key: "size", label: "SIZE", f: 0.17, align: "start" },
  { key: "rating", label: "RATING / SCHED.", f: 0.18, align: "start" },
  { key: "spec", label: "SPECIFICATION", f: 0.19, align: "start" },
  { key: "description", label: "DESCRIPTION", f: 0.28, align: "start" },
];

/* Word-wrap a string to fit `maxW` px at `fs` px Arial. Breaks on spaces,
   and hard-breaks any single token longer than the column. Never drops text
   (no truncation), so BOM cells always show their full content. */
function wrapText(str, maxW, fs) {
  const s = String(str ?? "").trim();
  if (!s) return [""];
  const charW = fs * 0.55;
  const maxChars = Math.max(1, Math.floor(maxW / charW));
  const out = [];
  let cur = "";
  for (const word of s.split(/\s+/)) {
    if (word.length > maxChars) {                 // token longer than the column
      if (cur) { out.push(cur); cur = ""; }
      let rem = word;
      while (rem.length > maxChars) { out.push(rem.slice(0, maxChars)); rem = rem.slice(maxChars); }
      cur = rem;
      continue;
    }
    const test = cur ? `${cur} ${word}` : word;
    if (test.length <= maxChars) cur = test;
    else { if (cur) out.push(cur); cur = word; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/* Title-block values stay on one line (fixed-size boxes) — keep them tidy. */
const clip = (s, colW, fs) => {
  const str = String(s ?? "");
  const max = Math.max(1, Math.floor(colW / (fs * 0.55)));
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

export default function PrintSheet({
  onClose, pointsById, edges, edgeById, groups, bomItems, nodeMeta, qtyByItem, geom, symD,
}) {
  const [title, setTitle] = useState("");
  const [lineNo, setLineNo] = useState("");
  const [dwgNo, setDwgNo] = useState("");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /* ── geometry: fit + centre the whole drawing in the left column ── */
  const layout = useMemo(() => {
    const cx0 = FRAME + INSET, cy0 = FRAME + INSET;
    const cx1 = SHEET_W - FRAME - INSET, cy1 = SHEET_H - FRAME - INSET;
    const drawX1 = cx0 + Math.round((cx1 - cx0) * DRAW_FRAC);

    const b = drawingBounds({ pointsById, nodeMeta, groups, edgeById, symDiameter: symD, balloonDrop: 0 });

    const areaX = cx0 + PAD, areaY = cy0 + PAD;
    const areaW = (drawX1 - cx0) - 2 * PAD;
    const areaH = (cy1 - cy0) - 2 * PAD;
    const areaHEff = areaH - BALLOON_RESERVE;

    let f = 1, tX = areaX, tY = areaY;
    if (b) {
      const bw = Math.max(b.maxX - b.minX, 1);
      const bh = Math.max(b.maxY - b.minY, 1);
      f = Math.min(areaW / bw, areaHEff / bh, FMAX);
      const cwX = (b.minX + b.maxX) / 2, cwY = (b.minY + b.maxY) / 2;
      tX = areaX + areaW / 2 - f * cwX;
      tY = areaY + areaHEff / 2 - f * cwY;
    }

    const wl = (cx0 - tX) / f, wt = (cy0 - tY) / f;
    const wr = (drawX1 - tX) / f, wb = (cy1 - tY) / f;
    const grid = isoGridLines(wl, wt, wr, wb, geom);

    return { cx0, cy0, cx1, cy1, drawX1, f, tX, tY, grid };
  }, [pointsById, nodeMeta, groups, edgeById, symD, geom]);

  const { cx0, cy0, cx1, cy1, drawX1, f, tX, tY, grid } = layout;

  /* ── balloons (world-space placement, projected at render) ── */
  const balloons = useMemo(() => {
    const items = [];
    for (const g of groups) {
      const c = groupCentroid(g.edgeIds, edgeById, pointsById);
      if (!c) continue;
      const idx = g.bomItemId ? bomItems.findIndex((x) => x.id === g.bomItemId) : -1;
      items.push({ key: g.id, cx: c.x, cy: c.y, label: idx >= 0 ? String(idx + 1) : "–" });
    }
    for (const [nid, meta] of Object.entries(nodeMeta)) {
      if (!meta.bomItemId) continue;
      const p = pointsById[nid]; if (!p) continue;
      const idx = bomItems.findIndex((x) => x.id === meta.bomItemId);
      if (idx < 0) continue;
      items.push({ key: `nb${nid}`, cx: p.x, cy: p.y, label: String(idx + 1), anchorNodeId: nid,
        anchorPad: meta.symbolId ? symD * 0.32 : 0 });
    }
    return placeBalloons({
      items, edges, pointsById, nodeMeta,
      symHalf: symD * 0.3, R: 11 / f, gap: 7 / f, stem: 11 / f, clearance: 3 / f,
    });
  }, [groups, edgeById, pointsById, bomItems, nodeMeta, edges, symD, f]);

  /* ── nodes shown on the sheet (same rule as the live canvas) ──
     show every pipe-end / fitting-end / junction node, EXCEPT interior nodes
     that the grouping rule hides, and fitting nodes (covered by their glyph). */
  const visibleNodes = useMemo(() => {
    const globalDeg = {};
    for (const e of edges) { globalDeg[e.a] = (globalDeg[e.a] || 0) + 1; globalDeg[e.b] = (globalDeg[e.b] || 0) + 1; }
    const hidden = new Set();
    for (const g of groups) {
      const gd = {};
      for (const eid of g.edgeIds) {
        const e = edgeById[eid]; if (!e) continue;
        gd[e.a] = (gd[e.a] || 0) + 1; gd[e.b] = (gd[e.b] || 0) + 1;
      }
      for (const [nid, deg] of Object.entries(gd))
        if (deg >= 2 && (globalDeg[nid] || 0) === deg) hidden.add(nid);
    }
    return Object.values(pointsById).filter(
      (p) => !hidden.has(p.id) && !nodeMeta[p.id]?.symbolId,
    );
  }, [edges, groups, edgeById, pointsById, nodeMeta]);

  /* ── BOM table geometry + word-wrapped, auto-fitted rows ── */
  const bom = useMemo(() => {
    const bomX0 = drawX1, bomX1 = cx1, bomW = bomX1 - bomX0;
    const titleTop = cy1 - TITLE_H;

    const colX = []; { let acc = bomX0; for (const c of COLS) { colX.push(acc); acc += c.f * bomW; } colX.push(bomX1); }
    const innerW = (i) => Math.max(8, colX[i + 1] - colX[i] - 2 * CELL_PAD);

    // header wrap → header-row height
    const headLines = COLS.map((c, i) => wrapText(c.label, innerW(i), HEAD_FS));
    const maxHeadLines = Math.max(1, ...headLines.map((l) => l.length));
    const headRowH = Math.max(22, maxHeadLines * (HEAD_FS * 1.3) + 10);
    const tableTop = cy0 + HEAD_BAR_H + headRowH;

    // body wrap → per-row natural heights
    const rows = bomItems.map((it, i) => ({
      no: i + 1, qty: qtyByItem[it.id] || 0,
      size: it.size, rating: it.rating, spec: it.spec, description: it.description,
    }));
    const lineH0 = BODY_FS * 1.32;
    const rowData = rows.map((r) => {
      const cells = COLS.map((c, ci) => {
        const val = c.key === "no" ? r.no : (c.key === "qty" ? r.qty : r[c.key]);
        return wrapText(val, innerW(ci), BODY_FS);
      });
      const nlines = Math.max(1, ...cells.map((c) => c.length));
      return { cells, nlines, h: Math.max(18, nlines * lineH0 + 2 * V_PAD) };
    });

    // shrink uniformly if the stack would spill into the title block
    const avail = titleTop - tableTop;
    const totalH = rowData.reduce((a, r) => a + r.h, 0);
    const s = totalH > avail && totalH > 0 ? Math.max(0.4, avail / totalH) : 1;
    const fs = BODY_FS * s, lineH = lineH0 * s;

    let acc = tableTop;
    for (const rd of rowData) { rd.top = acc; rd.h *= s; acc += rd.h; }

    return { bomX0, bomX1, bomW, titleTop, colX, innerW, headLines, headRowH, tableTop, rowData, fs, lineH };
  }, [drawX1, cx1, cy0, cy1, bomItems, qtyByItem]);

  /* ── PNG export ── */
  function savePng() {
    const svg = document.getElementById("iso-sheet-svg");
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", SHEET_W);
    clone.setAttribute("height", SHEET_H);
    const xml = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
    const img = new Image();
    img.onload = () => {
      const k = 2;
      const canvas = document.createElement("canvas");
      canvas.width = SHEET_W * k; canvas.height = SHEET_H * k;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = `${(title || "isometric").trim().replace(/\s+/g, "_") || "isometric"}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(href);
      }, "image/png");
    };
    img.src = url;
  }

  const fieldCls =
    "px-2 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder-gray-400 " +
    "focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400";
  const btn = "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0";

  const TitleCell = ({ x, y, w, h, label, value }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={INK} strokeWidth="0.8" />
      <text x={x + 5} y={y + 11} fontFamily={SANS} fontSize="7" fill="#6b7280" letterSpacing="0.5">{label}</text>
      <text x={x + 5} y={y + h - 7} fontFamily={SANS} fontSize="11" fontWeight="700" fill={INK}>{value}</text>
    </g>
  );

  const { bomX0, bomX1, bomW, titleTop, colX, headLines, headRowH, tableTop, rowData, fs, lineH } = bom;
  const titleLines = wrapText(title || "—", bomW - 12, 15).slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-800/70 backdrop-blur-sm">
      {/* ── toolbar (not printed) ── */}
      <div className="no-print shrink-0 flex flex-wrap items-center gap-2 px-2 sm:px-3 py-2 bg-white border-b border-gray-200 shadow">
        <button onClick={onClose} className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}>✕ Close</button>
        <span className="hidden sm:inline text-sm font-semibold text-gray-700 mr-1">Iso Sheet</span>
        <input className={`${fieldCls} flex-1 min-w-[130px]`} placeholder="Drawing title" value={title}
          onChange={(e) => setTitle(e.target.value)} />
        <input className={`${fieldCls} w-24 sm:w-32`} placeholder="Line No." value={lineNo}
          onChange={(e) => setLineNo(e.target.value)} />
        <input className={`${fieldCls} w-24 sm:w-28`} placeholder="Dwg No." value={dwgNo}
          onChange={(e) => setDwgNo(e.target.value)} />
        <div className="ml-auto flex items-center gap-2">
          <button onClick={savePng} className={`${btn} bg-gray-700 text-white hover:bg-gray-800`}>Save PNG</button>
          <button onClick={() => window.print()} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Print</button>
        </div>
      </div>

      {/* ── scrollable sheet stage ── */}
      <div className="flex-1 overflow-auto p-2 sm:p-4 flex items-start justify-center">
        <div id="iso-print-sheet" className="bg-white shadow-2xl w-full" style={{ maxWidth: SHEET_W }}>
          <svg id="iso-sheet-svg" viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} width={SHEET_W} height={SHEET_H}
            style={{ width: "100%", height: "auto", display: "block" }}
            xmlns="http://www.w3.org/2000/svg">

            {/* paper + double border */}
            <rect x="0" y="0" width={SHEET_W} height={SHEET_H} fill="#ffffff" />
            <rect x={FRAME} y={FRAME} width={SHEET_W - 2 * FRAME} height={SHEET_H - 2 * FRAME}
              fill="none" stroke={INK} strokeWidth="2" />
            <rect x={cx0} y={cy0} width={cx1 - cx0} height={cy1 - cy0}
              fill="none" stroke={INK} strokeWidth="0.8" />
            <line x1={drawX1} y1={cy0} x2={drawX1} y2={cy1} stroke={INK} strokeWidth="1.2" />

            {/* ── drawing (clipped to its frame) ── */}
            <clipPath id="drawClip">
              <rect x={cx0} y={cy0} width={drawX1 - cx0} height={cy1 - cy0} />
            </clipPath>
            <g clipPath="url(#drawClip)">
              <g transform={`translate(${tX} ${tY}) scale(${f})`}>
                <g stroke={GRID} strokeWidth="1">
                  {grid.verticals.map((l) => <line key={l.id} {...l} vectorEffect="non-scaling-stroke" />)}
                  {grid.d1.map((l) => <line key={l.id} {...l} vectorEffect="non-scaling-stroke" />)}
                  {grid.d2.map((l) => <line key={l.id} {...l} vectorEffect="non-scaling-stroke" />)}
                </g>
                {edges.map((e) => {
                  const a = pointsById[e.a], b = pointsById[e.b];
                  if (!a || !b) return null;
                  return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={INK} strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
                })}
                {/* pipe-end / junction nodes — match the on-screen drawing */}
                {visibleNodes.map((p) => (
                  <circle key={`nd${p.id}`} cx={p.x} cy={p.y} r={3.3 / f} fill={INK} />
                ))}
                {Object.entries(nodeMeta).map(([nid, meta]) => {
                  if (!meta.symbolId) return null;
                  const p = pointsById[nid]; const sym = SYMBOL_BY_ID[meta.symbolId];
                  if (!p || !sym) return null;
                  return (
                    <FittingGlyph key={`s${nid}`} symbol={sym} x={p.x} y={p.y}
                      rotation={meta.rotation || 0} size={symD}
                      color={INK} strokeWidth={2.4} maskColor="#ffffff" />
                  );
                })}
              </g>

              {balloons.map((b) => {
                const cxs = tX + f * b.bx, cys = tY + f * b.by;
                const x1 = tX + f * b.sx1, y1 = tY + f * b.sy1;
                const x2 = tX + f * b.sx2, y2 = tY + f * b.sy2;
                return (
                  <g key={b.key}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth="1" />
                    <circle cx={cxs} cy={cys} r="11" fill="#ffffff" stroke={INK} strokeWidth="1.4" />
                    <text x={cxs} y={cys} textAnchor="middle" dominantBaseline="central"
                      fontFamily={SANS} fontSize="12" fontWeight="700" fill={INK}>{b.label}</text>
                  </g>
                );
              })}
            </g>

            {/* north arrow */}
            <g transform={`translate(${cx0 + 30} ${cy0 + 34})`}>
              {[[-19, -11], [19, 11], [-19, 11], [19, -11]].map(([x, y], i) => (
                <line key={i} x1="0" y1="0" x2={x} y2={y} stroke="#4b5563" strokeWidth="1.6" strokeLinecap="round" />
              ))}
              <polygon points="19,-11 9,-9.5 14,-3" fill="#4b5563" />
              <text x="26" y="-15" fontFamily={SANS} fontSize="12" fontWeight="700" fill={INK}>N</text>
              <text x="0" y="34" textAnchor="middle" fontFamily={SANS} fontSize="7.5" fill="#6b7280">PLANT&nbsp;NORTH</text>
            </g>
            <text x={drawX1 - 8} y={cy0 + 14} textAnchor="end" fontFamily={SANS} fontSize="9"
              fill="#9ca3af" letterSpacing="0.6">PIPING ISOMETRIC · NOT TO SCALE</text>

            {/* ── BOM header bar ── */}
            <rect x={bomX0} y={cy0} width={bomW} height={HEAD_BAR_H} fill={INK} />
            <text x={bomX0 + bomW / 2} y={cy0 + HEAD_BAR_H / 2 + 1} textAnchor="middle" dominantBaseline="central"
              fontFamily={SANS} fontSize="12" fontWeight="700" fill="#ffffff" letterSpacing="1">
              BILL OF MATERIALS
            </text>

            {/* column header row (wrapped, never overlapping) */}
            <rect x={bomX0} y={cy0 + HEAD_BAR_H} width={bomW} height={headRowH} fill="#f3f4f6" />
            {COLS.map((c, i) => {
              const lines = headLines[i];
              const n = lines.length;
              const cxMid = (colX[i] + colX[i + 1]) / 2;
              const xPos = c.align === "middle" ? cxMid : colX[i] + CELL_PAD;
              const midY = cy0 + HEAD_BAR_H + headRowH / 2;
              return lines.map((ln, li) => (
                <text key={`${c.key}-h${li}`} x={xPos}
                  y={midY + (li - (n - 1) / 2) * (HEAD_FS * 1.3)}
                  textAnchor={c.align} dominantBaseline="central"
                  fontFamily={SANS} fontSize={HEAD_FS} fontWeight="700" fill="#374151" letterSpacing="0.2">
                  {ln}
                </text>
              ));
            })}

            {/* table body — word-wrapped, vertically centred, no truncation */}
            {rowData.map((rd, ri) => (
              <g key={ri}>
                {ri % 2 === 1 && <rect x={bomX0} y={rd.top} width={bomW} height={rd.h} fill="#fafafa" />}
                {COLS.map((c, ci) => {
                  const lines = rd.cells[ci];
                  const n = lines.length;
                  const xPos = c.align === "middle" ? (colX[ci] + colX[ci + 1]) / 2 : colX[ci] + CELL_PAD;
                  const midY = rd.top + rd.h / 2;
                  return lines.map((ln, li) => (
                    <text key={`${ci}-${li}`} x={xPos}
                      y={midY + (li - (n - 1) / 2) * lineH}
                      textAnchor={c.align} dominantBaseline="central"
                      fontFamily={SANS} fontSize={fs}
                      fontWeight={c.key === "no" ? 700 : 400} fill={INK}>
                      {ln}
                    </text>
                  ));
                })}
              </g>
            ))}
            {!rowData.length && (
              <text x={bomX0 + bomW / 2} y={tableTop + 30} textAnchor="middle"
                fontFamily={SANS} fontSize="10" fill="#9ca3af">No BOM items assigned</text>
            )}

            {/* table grid lines */}
            <rect x={bomX0} y={cy0} width={bomW} height={titleTop - cy0} fill="none" stroke={INK} strokeWidth="0.8" />
            <line x1={bomX0} y1={cy0 + HEAD_BAR_H} x2={bomX1} y2={cy0 + HEAD_BAR_H} stroke={INK} strokeWidth="0.8" />
            <line x1={bomX0} y1={tableTop} x2={bomX1} y2={tableTop} stroke={INK} strokeWidth="0.8" />
            {colX.slice(1, -1).map((x, i) => (
              <line key={`c${i}`} x1={x} y1={cy0 + HEAD_BAR_H} x2={x} y2={titleTop} stroke={INK} strokeWidth="0.6" />
            ))}
            {rowData.map((rd, ri) => {
              const y = rd.top + rd.h;
              if (y > titleTop + 0.5) return null;
              return <line key={`r${ri}`} x1={bomX0} y1={y} x2={bomX1} y2={y} stroke="#d1d5db" strokeWidth="0.5" />;
            })}

            {/* ── title block (bottom-right) ── */}
            <rect x={bomX0} y={titleTop} width={bomW} height={cy1 - titleTop} fill="#ffffff" stroke={INK} strokeWidth="1" />
            <rect x={bomX0} y={titleTop} width={bomW} height="46" fill="none" stroke={INK} strokeWidth="0.8" />
            <text x={bomX0 + 6} y={titleTop + 12} fontFamily={SANS} fontSize="7" fill="#6b7280" letterSpacing="0.5">DRAWING TITLE</text>
            {titleLines.map((ln, li) => (
              <text key={`t${li}`} x={bomX0 + 6}
                y={titleTop + (titleLines.length > 1 ? 28 : 36) + li * 16}
                fontFamily={SANS} fontSize={titleLines.length > 1 ? 13 : 15} fontWeight="700" fill={INK}>
                {ln}
              </text>
            ))}
            {(() => {
              const gx0 = bomX0, gy0 = titleTop + 46, gw = bomW, gh = (cy1 - titleTop - 46);
              const cw = gw / 3, ch = gh / 2;
              const cells = [
                { label: "DRAWN BY", value: "—" },
                { label: "DATE", value: today },
                { label: "SCALE", value: "NTS" },
                { label: "LINE No.", value: clip(lineNo || "—", cw - 10, 11) },
                { label: "DWG No.", value: clip(dwgNo || "—", cw - 10, 11) },
                { label: "REV", value: "0" },
              ];
              return cells.map((c, i) => (
                <TitleCell key={i}
                  x={gx0 + (i % 3) * cw} y={gy0 + Math.floor(i / 3) * ch}
                  w={cw} h={ch} label={c.label} value={c.value} />
              ));
            })()}
          </svg>
        </div>
      </div>
    </div>
  );
}

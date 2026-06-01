import { useState, useRef, useEffect } from "react";
import { SYMBOLS, SymbolThumb } from "../lib/symbols";

/* ── icons ──────────────────────────────────────────────────────── */
const ClipboardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h6" />
  </svg>
);
const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
const RotateIcon = ({ ccw }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={ccw ? "scale-x-[-1]" : ""}>
    <path d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" />
  </svg>
);
const ShapesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="7" r="4" /><path d="M14 4h6v6h-6zM12 20l4-7 4 7z" />
  </svg>
);
const ChevronIcon = ({ up }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform ${up ? "rotate-180" : ""}`}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const PrinterIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
);
const AlignIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h16M12 4v16" /><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
  </svg>
);

/* ── component ──────────────────────────────────────────────────── */
export default function BomPanel({
  mode, onModeChange,
  selectedEdgeCount, hasNodeSel, selectedNodeHasSymbol, selectedNodeSymbolId,
  canGroup, hasGroupsSel, canAssign, selectedBomItemIds,
  bomItems, qtyByItem, hasDrawing,
  onGroup, onUngroup, onDelete, onDeleteNode,
  onPickSymbol, onRotate, onAlign, onRemoveFitting,
  onAddItem, onUpdateItem, onDeleteItem, onAssign,
  onOpenSheet,
}) {
  const [sheet, setSheet] = useState(null);          // 'bom' | 'symbol' | null
  const listRef = useRef(null);

  useEffect(() => { if (!hasNodeSel && sheet === "symbol") setSheet(null); },
    [hasNodeSel, sheet]);

  const prevCount = useRef(bomItems.length);
  useEffect(() => {
    if (bomItems.length > prevCount.current && listRef.current)
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    prevCount.current = bomItems.length;
  }, [bomItems.length]);

  const assignedSet = new Set(selectedBomItemIds);

  // After choosing a fitting or assigning a BOM number, close the sheet right
  // away so the user can see what it was applied to on the drawing.
  const pickAndClose = (id) => { onPickSymbol(id); setSheet(null); };
  const assignAndClose = (id) => { onAssign(id); setSheet(null); };

  const handleDeleteItem = (item, idx, qty) => {
    if (qty > 0 &&
        !window.confirm(`Item #${idx + 1} has ${qty} object${qty > 1 ? "s" : ""} assigned to it. Delete it anyway?`))
      return;
    onDeleteItem(item.id);
  };

  const Pill = "rounded-full text-[11px] font-semibold transition-colors";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center pointer-events-none px-2"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="w-full max-w-2xl flex flex-col items-stretch">

        {/* ─── BOM sheet ─────────────────────────────────────── */}
        {sheet === "bom" && (
          <div className="pointer-events-auto mb-1.5 max-h-[46vh] bg-white rounded-2xl
            shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
            {canAssign && (
              <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-center shrink-0">
                <span className="text-[11px] text-amber-700 font-medium">
                  Tap an item number to assign the current selection
                </span>
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 shrink-0">
              <span className="font-semibold text-gray-800 text-sm">Bill of Materials</span>
              <button onClick={onAddItem}
                className="px-2.5 py-1 rounded-full bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700">
                + Add
              </button>
            </div>

            <div ref={listRef} className="flex-1 overflow-auto p-1.5 space-y-1.5">
              {bomItems.map((item, idx) => {
                const qty = qtyByItem[item.id] || 0;
                const here = assignedSet.has(item.id);
                return (
                  <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <button disabled={!canAssign} onClick={() => assignAndClose(item.id)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-all
                          ${here ? "bg-amber-400 border-amber-500 text-white scale-110"
                            : canAssign ? "border-blue-400 bg-blue-50 text-blue-700 active:scale-95"
                            : "border-gray-300 text-gray-400 bg-white"}`}>
                        {idx + 1}
                      </button>
                      <span className="text-[11px] text-gray-500 tabular-nums">
                        Qty&nbsp;<strong className="text-gray-800">{qty}</strong>
                      </span>
                      <button onClick={() => handleDeleteItem(item, idx, qty)}
                        className="ml-auto p-1.5 rounded-lg text-red-500 hover:bg-red-50 active:bg-red-100">
                        <TrashIcon />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[["size", "Size"], ["rating", "Rating / Sched."],
                        ["spec", "Specification"], ["description", "Description"]].map(([f, label]) => (
                        <input key={f} placeholder={label} value={item[f]}
                          onChange={(e) => onUpdateItem(item.id, f, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white text-gray-900 border border-gray-300
                            rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2
                            focus:ring-blue-400/40 focus:border-blue-400" />
                      ))}
                    </div>
                  </div>
                );
              })}
              {!bomItems.length && (
                <p className="text-center text-gray-400 text-xs py-10">
                  No items yet.&ensp;Tap <strong>+ Add</strong> to create one.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── Symbol picker sheet ───────────────────────────── */}
        {sheet === "symbol" && hasNodeSel && (
          <div className="pointer-events-auto mb-1.5 max-h-[46vh] bg-white rounded-2xl
            shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 shrink-0">
              <span className="font-semibold text-gray-800 text-sm">Fittings &amp; Symbols</span>
              {selectedNodeHasSymbol && (
                <button onClick={onRemoveFitting}
                  className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-semibold hover:bg-red-100">
                  Remove
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-2 grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {SYMBOLS.map((s) => {
                const active = s.id === selectedNodeSymbolId;
                return (
                  <button key={s.id} onClick={() => pickAndClose(s.id)}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-colors
                      ${active ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <SymbolThumb symbol={s} />
                    <span className="text-[10px] leading-tight text-gray-600 text-center">{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Context actions: EDGES selected ───────────────── */}
        {mode === "select" && selectedEdgeCount > 0 && (
          <div className="self-center pointer-events-auto mb-1.5 flex flex-wrap items-center justify-center gap-1.5
            px-1.5 py-1 bg-gray-900/90 backdrop-blur-sm rounded-3xl shadow-lg max-w-[96vw]">
            <button disabled={!canGroup} onClick={onGroup}
              className={`${Pill} px-3 py-1.5 bg-emerald-500 text-white disabled:opacity-25 active:bg-emerald-600`}>
              Group
            </button>
            <button disabled={!hasGroupsSel} onClick={onUngroup}
              className={`${Pill} px-3 py-1.5 bg-gray-600 text-white disabled:opacity-25 active:bg-gray-500`}>
              Ungroup
            </button>
            <span className="text-[11px] text-gray-400 tabular-nums px-1">{selectedEdgeCount}&thinsp;sel</span>
            <button onClick={onDelete}
              className={`${Pill} px-3 py-1.5 bg-red-500 text-white active:bg-red-600`}>
              Delete
            </button>
          </div>
        )}

        {/* ─── Context actions: single NODE selected ─────────── */}
        {mode === "select" && !selectedEdgeCount && hasNodeSel && (
          <div className="self-center pointer-events-auto mb-1.5 flex flex-wrap items-center justify-center gap-1.5
            px-1.5 py-1 bg-gray-900/90 backdrop-blur-sm rounded-3xl shadow-lg max-w-[96vw]">
            <button onClick={() => setSheet((s) => (s === "symbol" ? null : "symbol"))}
              className={`${Pill} px-3 py-1.5 flex items-center gap-1
                ${sheet === "symbol" ? "bg-blue-500 text-white" : "bg-blue-500/90 text-white active:bg-blue-600"}`}>
              <ShapesIcon /> Fitting
            </button>
            {selectedNodeHasSymbol && (
              <>
                <button onClick={onAlign} title="Align to pipe run"
                  className={`${Pill} px-2.5 py-1.5 flex items-center gap-1 bg-gray-600 text-white active:bg-gray-500`}>
                  <AlignIcon /> Align
                </button>
                <button onClick={() => onRotate(-15)}
                  className={`${Pill} p-1.5 bg-gray-600 text-white active:bg-gray-500`}><RotateIcon ccw /></button>
                <button onClick={() => onRotate(15)}
                  className={`${Pill} p-1.5 bg-gray-600 text-white active:bg-gray-500`}><RotateIcon /></button>
              </>
            )}
            <button onClick={onDeleteNode}
              className={`${Pill} px-3 py-1.5 bg-red-500 text-white active:bg-red-600`}>
              Delete
            </button>
          </div>
        )}

        {/* ─── Main bar ──────────────────────────────────────── */}
        <div className="self-center pointer-events-auto mb-1.5 flex flex-wrap items-center justify-center gap-1.5
          px-1 py-1 bg-white/95 backdrop-blur rounded-3xl shadow-lg border border-gray-200/80 max-w-[96vw]">
          <div className="inline-flex rounded-full overflow-hidden border border-gray-200">
            {["draw", "select"].map((m) => (
              <button key={m} onClick={() => onModeChange(m)}
                className={`px-3 py-1.5 text-[11px] font-semibold capitalize transition-colors
                  ${mode === m ? "bg-blue-600 text-white" : "bg-white text-gray-600 active:bg-gray-100"}`}>
                {m === "draw" ? "✏️ Draw" : "👆 Select"}
              </button>
            ))}
          </div>
          <button onClick={() => setSheet((s) => (s === "bom" ? null : "bom"))}
            className={`flex items-center gap-1 px-2.5 py-1.5 ${Pill}
              ${sheet === "bom" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 active:bg-gray-200"}`}>
            <ClipboardIcon /> BOM
            {bomItems.length > 0 && (
              <span className={`ml-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold
                flex items-center justify-center leading-none
                ${sheet === "bom" ? "bg-white/25" : "bg-blue-600 text-white"}`}>
                {bomItems.length}
              </span>
            )}
            <ChevronIcon up={sheet === "bom"} />
          </button>
          <button onClick={onOpenSheet} disabled={!hasDrawing} title="Generate printable iso sheet"
            className={`flex items-center gap-1 px-2.5 py-1.5 ${Pill}
              ${hasDrawing ? "bg-gray-100 text-gray-700 active:bg-gray-200" : "bg-gray-100 text-gray-300 cursor-not-allowed"}`}>
            <PrinterIcon /> Sheet
          </button>
        </div>
      </div>
    </div>
  );
}
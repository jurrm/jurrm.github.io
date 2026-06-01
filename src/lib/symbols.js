/* Each symbol's `body` is the inner SVG drawn in a 0–100 viewBox,
   centred on (50,50), with its FLOW AXIS running horizontally (←→).
   Stroke colour + width are inherited from the wrapper via `currentColor`,
   so a symbol always matches the colour of the pipe it sits on. Solid
   accents use fill="currentColor"; open outlines use fill="none".
   `vectorEffect="non-scaling-stroke"` keeps the line weight identical to
   the pipe lines at every zoom level.

   `mask` (OPTIONAL, configurable PER SYMBOL) is an opaque rectangle painted
   in the background/paper colour BEHIND the symbol's strokes. It hides the
   pipe line that passes through the fitting so the fitting reads as a solid
   object instead of having a line straight through it. Units are the same
   0–100 viewBox units as `body`, and it rotates + scales with the symbol:

       mask: { w, h }           → rectangle centred on (50, 50)
       mask: { w, h, cx, cy }   → rectangle centred on (cx, cy)

   Omit `mask` (or set it to null) for symbols that SHOULD let the pipe show
   through — e.g. a slip-on flange, which is just a tick mark on the pipe.
   Tune w / h per symbol: some need a bigger cover, some smaller, some none. */

export const SYMBOLS = [
  {
    id: "globe_valve_bw",
    name: "Globe Valve (BW)",
    mask: { w: 42, h: 30 },
    body: (
      <>
        <polygon points="30,36 50,50 30,64" fill="none" vectorEffect="non-scaling-stroke" />
        <polygon points="70,36 50,50 70,64" fill="none" vectorEffect="non-scaling-stroke" />
        <circle cx="50" cy="50" r="4.5" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    id: "butterfly_valve_bw",
    name: "Butterfly Valve (BW)",
    mask: { w: 24, h: 24 },
    body: (
      <>
        <line x1="40" y1="40" x2="40" y2="60" vectorEffect="non-scaling-stroke" />
        <line x1="60" y1="40" x2="60" y2="60" vectorEffect="non-scaling-stroke" />
        <line x1="40" y1="60" x2="60" y2="40" vectorEffect="non-scaling-stroke" />
        <circle cx="50" cy="50" r="4" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    id: "blind_flange",
    name: "Blind Flange",
    /* a cap / line terminator — the solid bar is the cap, no line passes
       through, so no mask is needed */
    mask: null,
    body: <rect x="48" y="36" width="6" height="28" fill="currentColor" stroke="none" />,
  },
  {
    id: "slip_on_flange",
    name: "Slip-On Flange",
    /* just a perpendicular tick on a continuous pipe → let the line show */
    mask: null,
    body: <line x1="50" y1="36" x2="50" y2="64" vectorEffect="non-scaling-stroke" />,
  },
  {
    id: "three_way_flanged",
    name: "3-Way Valve (Flgd)",
    mask: { w: 40, h: 36 },
    body: (
      <>
        <polygon points="30,38 50,50 30,62" fill="none" vectorEffect="non-scaling-stroke" />
        <polygon points="70,38 50,50 70,62" fill="none" vectorEffect="non-scaling-stroke" />
        <polygon points="38,30 62,30 50,50" fill="none" vectorEffect="non-scaling-stroke" />
        <line x1="26" y1="34" x2="26" y2="66" vectorEffect="non-scaling-stroke" />
        <line x1="74" y1="34" x2="74" y2="66" vectorEffect="non-scaling-stroke" />
        <line x1="40" y1="26" x2="60" y2="26" vectorEffect="non-scaling-stroke" />
      </>
    ),
  },
  {
    id: "three_way_bw",
    name: "3-Way Valve (BW)",
    mask: { w: 40, h: 36 },
    body: (
      <>
        <polygon points="30,38 50,50 30,62" fill="none" vectorEffect="non-scaling-stroke" />
        <polygon points="70,38 50,50 70,62" fill="none" vectorEffect="non-scaling-stroke" />
        <polygon points="38,30 62,30 50,50" fill="none" vectorEffect="non-scaling-stroke" />
      </>
    ),
  },
  {
    id: "check_valve_bw",
    name: "Check Valve (BW)",
    mask: { w: 34, h: 26 },
    body: (
      <>
        <polygon points="34,38 34,62 60,50" fill="none" vectorEffect="non-scaling-stroke" />
        <line x1="62" y1="40" x2="62" y2="60" vectorEffect="non-scaling-stroke" />
      </>
    ),
  },
];

export const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));

/* The tight design bounds of every symbol inside the 0–100 box.
   Used to size things without the old white padding box. The widest
   extent any symbol reaches is x:[26,74] y:[26,74] (the 3-way valve). */
export const SYMBOL_EXTENT = 74 - 26; // = 48 of the 100-unit box

/**
 * A placed fitting: optional opaque mask (so the pipe doesn't show through)
 * with the symbol strokes painted on top, in the pipe colour. Shared by the
 * live canvas and the print sheet so they always look identical.
 */
export function FittingGlyph({
  symbol, x, y, rotation = 0, size,
  color = "#2563eb", strokeWidth = 2.5, maskColor = "#ffffff",
}) {
  if (!symbol) return null;
  const k = size / 100;
  const m = symbol.mask;
  return (
    <g style={{ color }}
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${k}) translate(-50 -50)`}>
      {m && (
        <rect
          x={(m.cx ?? 50) - m.w / 2}
          y={(m.cy ?? 50) - m.h / 2}
          width={m.w}
          height={m.h}
          fill={maskColor}
          stroke="none"
        />
      )}
      <g stroke="currentColor" strokeWidth={strokeWidth} fill="none"
        strokeLinecap="round" strokeLinejoin="round">
        {symbol.body}
      </g>
    </g>
  );
}

/* Small preview used inside the picker (no mask — nothing behind it). */
export function SymbolThumb({ symbol, size = 46 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ color: "#2563eb" }}>
      <g stroke="currentColor" strokeWidth="2.5" fill="none"
        strokeLinecap="round" strokeLinejoin="round">
        {symbol.body}
      </g>
    </svg>
  );
}

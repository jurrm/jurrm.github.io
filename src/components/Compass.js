export default function Compass() {
  const L = 22;
  const cos = 0.866, sin = 0.5; // 30° iso diagonals
  const dx = cos * L, dy = sin * L;

  const arm = (x2, y2) => (
    <line x1="0" y1="0" x2={x2} y2={y2} stroke="#374151" strokeWidth="2" strokeLinecap="round" />
  );
  const label = (x, y, t, bold) => (
    <text x={x} y={y} fontSize={bold ? 13 : 11} fontWeight={bold ? 700 : 500}
      fill={bold ? "#111827" : "#6b7280"} textAnchor="middle" dominantBaseline="middle"
      fontFamily="ui-sans-serif, system-ui, sans-serif">{t}</text>
  );

  return (
    <div className="absolute top-3 left-3 sm:top-5 sm:left-5 pointer-events-none">
      <svg viewBox="-44 -44 88 88" className="w-16 h-16 sm:w-20 sm:h-20" aria-label="Compass">
        {arm(-dx, -dy)} {/* W */}
        {arm(dx, dy)}   {/* E */}
        {arm(-dx, dy)}  {/* S */}
        {arm(dx, -dy)}  {/* N */}
        {/* North arrowhead (top-right, X+) */}
        <polygon points={`${dx},${-dy} ${dx - 11},${-dy + 2.5} ${dx - 4},${-dy + 9}`} fill="#374151" />
        {label(dx + 9, -dy - 9, "N", true)}
        {label(-dx - 9, -dy - 9, "W")}
        {label(dx + 9, dy + 9, "E")}
        {label(-dx - 9, dy + 9, "S")}
      </svg>
    </div>
  );
}
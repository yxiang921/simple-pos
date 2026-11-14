/**
 * Small server-rendered SVG charts (no chart library): smooth area line with a
 * copper gradient and a dashed comparison line. Colours come from CSS variables
 * so they follow the light / dark theme.
 */
type Point = { label: string; value: number };

function smooth(points: [number, number][]) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

export function AreaChart({
  data,
  compare,
  height = 200,
  format = (v) => String(Math.round(v)),
  nowIndex,
  ariaLabel,
}: {
  data: Point[];
  /** Optional comparison series (same labels), drawn dashed. */
  compare?: number[];
  height?: number;
  format?: (v: number) => string;
  /** Points after this index are in the future (not drawn). */
  nowIndex?: number;
  ariaLabel: string;
}) {
  const W = 1100;
  const H = height;
  const pad = { l: 6, r: 6, t: 22, b: 6 };
  const max = Math.max(1, ...data.map((d) => d.value), ...(compare ?? []));
  const n = data.length;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, n - 1);
  const y = (v: number) => pad.t + (1 - v / (max * 1.1)) * (H - pad.t - pad.b);
  const upto = nowIndex ?? n - 1;
  const pts = data.slice(0, upto + 1).map((d, i) => [x(i), y(d.value)] as [number, number]);
  const line = smooth(pts);
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z` : "";
  const cmp = compare ? smooth(compare.map((v, i) => [x(i), y(v)] as [number, number])) : "";
  const last = pts[pts.length - 1];
  const peak = data.slice(0, upto + 1).reduce((b, d, i) => (d.value > b.v ? { v: d.value, i } : b), { v: -1, i: 0 });
  const id = `g${ariaLabel.replace(/\W/g, "")}`;

  const ticks = data.map((d, i) => ({ d, i })).filter(({ i }) => i % Math.ceil(n / 8) === 0);
  return (
    <div>
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e8a46d" />
          <stop offset="100%" stopColor="var(--primary)" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * 1.1 * f)} y2={y(max * 1.1 * f)} stroke="var(--line)" strokeDasharray="2 4" />
      ))}
      {cmp && <path d={cmp} fill="none" stroke="var(--subtle)" strokeWidth="1.5" strokeDasharray="4 5" opacity="0.8" />}
      {area && <path d={area} fill={`url(#${id}-fill)`} className="chart-reveal" />}
      {line && <path d={line} fill="none" stroke={`url(#${id}-line)`} strokeWidth="2.5" strokeLinecap="round" filter={`url(#${id}-glow)`} className="chart-draw" pathLength={1} />}
      {peak.v > 0 && (
        <g>
          <text x={x(peak.i)} y={y(peak.v) - 12} textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--primary-text)">
            {format(peak.v)}
          </text>
        </g>
      )}
      {last && (
        <g>
          <circle cx={last[0]} cy={last[1]} r="9" fill="var(--primary)" opacity="0.18" className="chart-pulse" />
          <circle cx={last[0]} cy={last[1]} r="4" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />
        </g>
      )}
    </svg>
      <div className="relative mt-2 h-4 text-[11px] text-subtle">
        {ticks.map(({ d, i }) => (
          <span key={d.label} className="tabular absolute -translate-x-1/2" style={{ left: `${(x(i) / W) * 100}%` }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

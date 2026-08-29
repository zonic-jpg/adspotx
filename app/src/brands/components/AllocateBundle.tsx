import React, { useMemo, useState } from "react";

// Cross-app bundle allocation — split a purchased bundle by percentage across the
// ZonicMe orbit. Allocations must total 100%. Drop into the brand portal's bundle
// checkout (per-campaign) or call standalone.
const APPS = [
  { id: "myyanga", name: "MyYanga", desc: "Fashion marketplace", col: "#c0112a" },
  { id: "myafriart", name: "MyAfriart", desc: "African art", col: "#9a7b1e" },
  { id: "owanbe", name: "Owanbe", desc: "Event planning", col: "#6C5CE7" },
  { id: "rubba", name: "Rubba", desc: "Life planning", col: "#1D9E75" },
  { id: "gameofproverbs", name: "Game of Proverbs", desc: "Proverb quiz app", col: "#E2563B" },
];
const nf = new Intl.NumberFormat("en-NG");

export type Allocation = { appId: string; percent: number; units: number };

export default function AllocateBundle({
  bundleSize = 1000, unitLabel = "impressions", onConfirm,
}: { bundleSize?: number; unitLabel?: string; onConfirm?: (a: Allocation[]) => void }) {
  const [size, setSize] = useState(bundleSize);
  const [pct, setPct] = useState<Record<string, number>>(Object.fromEntries(APPS.map((a) => [a.id, 0])));
  const total = useMemo(() => APPS.reduce((n, a) => n + (pct[a.id] || 0), 0), [pct]);
  const set = (id: string, v: number) => setPct((p) => ({ ...p, [id]: Math.max(0, Math.min(100, Math.round(v) || 0)) }));
  const splitEven = () => { const b = Math.floor(100 / APPS.length); const r = 100 - b * APPS.length; setPct(Object.fromEntries(APPS.map((a, i) => [a.id, b + (i < r ? 1 : 0)]))); };

  const confirm = () => onConfirm?.(APPS.filter((a) => pct[a.id] > 0).map((a) => ({ appId: a.id, percent: pct[a.id], units: Math.round(size * pct[a.id] / 100) })));

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold">Allocate your bundle across the ZonicMe orbit</h3>
      <p className="text-sm text-muted-foreground mb-4">Buy once, distribute everywhere. Split by percentage; allocations must total 100%.</p>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium">Bundle</label>
        <select className="h-10 rounded-lg border px-3 font-semibold" value={size} onChange={(e) => setSize(+e.target.value)}>
          {[1000, 5000, 10000, 25000].map((n) => <option key={n} value={n}>{nf.format(n)} {unitLabel}</option>)}
        </select>
      </div>

      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted mb-3">
        {APPS.map((a) => <span key={a.id} style={{ width: `${pct[a.id]}%`, background: a.col }} />)}
      </div>

      <div className="divide-y rounded-xl border">
        {APPS.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3">
            <span className="h-3 w-3 rounded-full" style={{ background: a.col }} />
            <div className="flex-1 min-w-0"><b className="block text-sm">{a.name}</b><small className="text-muted-foreground">{a.desc}</small></div>
            <input type="range" min={0} max={100} value={pct[a.id]} onChange={(e) => set(a.id, +e.target.value)} className="w-32" />
            <div className="flex items-center gap-1 w-20 justify-end">
              <input type="number" min={0} max={100} value={pct[a.id]} onChange={(e) => set(a.id, +e.target.value)} className="w-14 h-9 rounded-md border text-center font-semibold" />%
            </div>
            <div className="w-24 text-right text-xs font-semibold text-muted-foreground">{nf.format(Math.round(size * pct[a.id] / 100))}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 text-sm">
        <span>Total allocated</span>
        <span className={`font-extrabold text-base ${total === 100 ? "text-green-600" : "text-red-600"}`}>{total}%</span>
      </div>
      <div className="flex gap-2 my-3">
        <button type="button" onClick={splitEven} className="flex-1 h-10 rounded-lg border font-medium">Split evenly</button>
        <button type="button" onClick={() => setPct(Object.fromEntries(APPS.map((a) => [a.id, 0])))} className="flex-1 h-10 rounded-lg border font-medium">Clear</button>
      </div>
      <button type="button" disabled={total !== 100} onClick={confirm} className="w-full h-12 rounded-xl bg-foreground text-background font-semibold disabled:opacity-40">
        Confirm allocation
      </button>
    </div>
  );
}

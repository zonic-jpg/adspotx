import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  Sheet, SheetContent,
} from "@earn/components/ui/sheet";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Database, Shield, HardDrive, Cpu, ChevronDown, ChevronRight, Wrench,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
type CheckStatus = "ok" | "warning" | "error";
type OverallStatus = "healthy" | "degraded" | "critical";

interface Fallback   { tier: 1 | 2 | 3; name: string; description: string; active: boolean; }
interface FixOption  { id: string; label: string; description: string; hint?: string; }
interface DepCheck   {
  id: string; name: string; category: string; status: CheckStatus;
  message: string; detail?: string; latencyMs?: number;
  fallbacks: Fallback[]; fixOptions: FixOption[];
}
interface HealthData {
  status: OverallStatus; summary: string;
  checks: DepCheck[]; checkedAt: string; uptime: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const CAT_ICONS: Record<string, React.ElementType> = {
  database: Database, security: Shield, storage: HardDrive, runtime: Cpu,
};
const STATUS = {
  ok:      { dot: "bg-[#f97316]",  text: "text-[#c2410c]",  bg: "bg-[#f97316]/10", ring: "",                label: "OK"      },
  warning: { dot: "bg-amber-400",  text: "text-amber-700",  bg: "bg-amber-50",     ring: "ring-amber-200",  label: "Warning" },
  error:   { dot: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50",       ring: "ring-red-200",    label: "Error"   },
};
const OVERALL = {
  healthy:  { bg: "bg-[#f97316]", pulse: "bg-[#f97316]/50",  header: "bg-[#fff7ed]",  label: "All Systems OK"  },
  degraded: { bg: "bg-amber-400", pulse: "bg-amber-300",     header: "bg-amber-50",   label: "Degraded"        },
  critical: { bg: "bg-red-500",   pulse: "bg-red-400",       header: "bg-red-50",     label: "Critical Issues" },
};

// ─── CheckRow ───────────────────────────────────────────────────────────────────
function CheckRow({ check }: { check: DepCheck }) {
  const [open, setOpen] = useState(check.status !== "ok");
  const s  = STATUS[check.status];
  const Icon = CAT_ICONS[check.category] ?? Cpu;
  const hasExtra = Boolean(check.detail || check.fallbacks.length || check.fixOptions.length);

  return (
    <div className={`border border-black/[0.07] transition-colors ${check.status !== "ok" ? s.bg : "bg-white"}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => hasExtra && setOpen(o => !o)}
      >
        <Icon size={14} className="text-[#6b7280] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-[#0f0f14]">{check.name}</span>
            {check.latencyMs !== undefined && (
              <span className="text-[10px] font-mono text-[#9ca3af]">{check.latencyMs}ms</span>
            )}
          </div>
          <p className="text-[11px] text-[#6b7280] truncate">{check.message}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 ${s.text} ${s.bg}`}>{s.label}</span>
          {hasExtra && (open
            ? <ChevronDown size={12} className="text-[#9ca3af]" />
            : <ChevronRight size={12} className="text-[#9ca3af]" />)}
        </div>
      </button>

      {open && hasExtra && (
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-black/[0.05]">
          {check.detail && (
            <p className="text-[11px] text-[#6b7280] leading-relaxed">{check.detail}</p>
          )}

          {check.fallbacks.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#9ca3af] mb-1.5">
                Fallback Chain
              </p>
              <div className="space-y-1">
                {check.fallbacks.map(fb => (
                  <div
                    key={fb.tier}
                    className={`flex items-start gap-2.5 px-3 py-2 border border-black/[0.07] ${
                      fb.active ? "bg-amber-50 border-amber-200" : "bg-white"
                    }`}
                  >
                    <span className={`text-[9px] font-black px-1.5 py-0.5 shrink-0 mt-0.5 ${
                      fb.active ? "bg-amber-400 text-white" : "bg-[#f3f4f6] text-[#6b7280]"
                    }`}>
                      {fb.active ? "ACTIVE" : `T${fb.tier}`}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[#0f0f14]">{fb.name}</p>
                      <p className="text-[10px] text-[#9ca3af]">{fb.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {check.fixOptions.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#9ca3af] mb-1.5">
                Fix Options
              </p>
              <div className="space-y-1.5">
                {check.fixOptions.map(opt => (
                  <div key={opt.id} className="flex items-start gap-2 px-3 py-2.5 bg-white border border-black/[0.07]">
                    <Wrench size={11} className="text-[#e91e8c] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[#0f0f14]">{opt.label}</p>
                      <p className="text-[10px] text-[#6b7280] mb-1">{opt.description}</p>
                      {opt.hint && (
                        <p className="text-[10px] font-mono bg-[#f3f4f6] px-2 py-0.5 text-[#374151] break-all">
                          {opt.hint}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HealthIndicator (exported) ────────────────────────────────────────────────
export function HealthIndicator() {
  const [open, setOpen] = useState(false);

  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery<HealthData>({
    queryKey: ["admin-health"],
    queryFn: () => customFetch<HealthData>("/api/admin/health"),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  const status   = data?.status ?? "healthy";
  const style    = OVERALL[status];
  const hasIssue = status !== "healthy";
  const errCnt   = data?.checks.filter(c => c.status === "error").length   ?? 0;
  const warnCnt  = data?.checks.filter(c => c.status === "warning").length ?? 0;
  const okCnt    = data?.checks.filter(c => c.status === "ok").length      ?? 0;
  const lastAt   = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  const uptimeLabel = (() => {
    const s = data?.uptime ?? 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  return (
    <>
      {/* ── Button in admin header ── */}
      <button
        onClick={() => setOpen(true)}
        title={`System Health · ${style.label}`}
        className="relative flex items-center gap-2 px-3 py-1.5 border border-black/[0.1] hover:bg-[#f9f9f9] transition-colors"
      >
        <span className="relative flex h-2.5 w-2.5">
          {hasIssue && (
            <span className={`animate-ping absolute inset-0 rounded-full ${style.pulse} opacity-75`} />
          )}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${style.bg}`} />
        </span>
        <span className="text-[11px] font-black uppercase tracking-wider text-[#0f0f14]">
          {isLoading
            ? "Checking…"
            : hasIssue
              ? `${errCnt + warnCnt} Issue${errCnt + warnCnt !== 1 ? "s" : ""}`
              : "Systems OK"}
        </span>
        {isFetching && !isLoading && (
          <RefreshCw size={10} className="text-[#9ca3af] animate-spin" />
        )}
      </button>

      {/* ── Slide-out details panel ── */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[460px] max-w-full p-0 flex flex-col gap-0">

          {/* Header */}
          <div className={`px-6 py-5 border-b border-black/[0.07] shrink-0 ${style.header}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  {hasIssue && (
                    <span className={`animate-ping absolute inset-0 rounded-full ${style.pulse} opacity-75`} />
                  )}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${style.bg}`} />
                </span>
                <h2 className="text-[15px] font-black text-[#0f0f14]">System Health</h2>
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#6b7280] hover:text-[#0f0f14] border border-black/[0.1] hover:bg-white transition-colors disabled:opacity-50"
              >
                <RefreshCw size={10} className={isFetching ? "animate-spin" : ""} />
                Re-check
              </button>
            </div>
            <p className="text-[12px] text-[#6b7280]">{data?.summary ?? "Running health checks…"}</p>
            {lastAt && (
              <p className="text-[10px] text-[#9ca3af] mt-0.5">Last checked: {lastAt}</p>
            )}
          </div>

          {/* Summary counters */}
          {data && (
            <div className="grid grid-cols-3 divide-x divide-black/[0.07] border-b border-black/[0.07] shrink-0 bg-white">
              {[
                { label: "Critical", count: errCnt,  color: errCnt  > 0 ? "text-red-600"    : "text-[#d1d5db]" },
                { label: "Warnings", count: warnCnt, color: warnCnt > 0 ? "text-amber-600"  : "text-[#d1d5db]" },
                { label: "Healthy",  count: okCnt,   color:               "text-[#c2410c]"                      },
              ].map(item => (
                <div key={item.label} className="text-center py-3">
                  <p className={`text-[22px] font-black leading-none ${item.color}`}>{item.count}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Checks list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw size={20} className="animate-spin text-[#9ca3af]" />
              </div>
            ) : data ? (
              <div className="p-4 space-y-2">
                {[
                  ...data.checks.filter(c => c.status === "error"),
                  ...data.checks.filter(c => c.status === "warning"),
                  ...data.checks.filter(c => c.status === "ok"),
                ].map(check => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-[#9ca3af]">
                <XCircle size={24} />
                <p className="text-[12px]">Could not load health status</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {data && (
            <div className="px-4 py-3 border-t border-black/[0.07] bg-[#f9f9f9] shrink-0">
              <p className="text-[10px] text-[#9ca3af]">
                Server uptime: {uptimeLabel} · Auto-refreshes every 30s · Click any row for details
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

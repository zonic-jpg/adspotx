import { useState } from "react";
import { DashboardLayout } from "@earn/components/layout/DashboardLayout";
import {
  useGetPointsBalance, useGetLeaderboard, useGetAdFeed,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  Play, Trophy, Star, Clock, Zap,
  Coins, ChevronLeft, ChevronRight as ChevronRightIcon,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { getAdThumbUrl } from "@earn/lib/adMedia";

interface LedgerEntry {
  id: string;
  amount: number;
  source: string;
  description: string | null;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  ad_review:    "Ad review",
  admin_grant:  "Bonus",
  bonus:        "Bonus",
  referral:     "Referral",
  adjustment:   "Adjustment",
};

const LEDGER_PAGE = 15;

function useMyLedger(offset: number) {
  return useQuery<{ entries: LedgerEntry[]; total: number }>({
    queryKey: ["my-ledger", offset],
    queryFn: () =>
      customFetch(`/api/points/ledger?limit=${LEDGER_PAGE}&offset=${offset}`),
    staleTime: 30_000,
  });
}

export default function Dashboard() {
  const { data: balance, isLoading: loadingBalance } = useGetPointsBalance();
  const { data: leaderboard } = useGetLeaderboard();
  const { data: eligibility } = useQuery<{ eligible: boolean; missingFields: string[] }>({
    queryKey: ["lb-eligibility"],
    queryFn: () => customFetch("/api/leaderboard/eligibility"),
  });
  const { data: adFeed, isLoading: loadingFeed } = useGetAdFeed();
  const [showEarnings, setShowEarnings] = useState(false);
  const [ledgerOffset, setLedgerOffset] = useState(0);
  const { data: ledger, isLoading: loadingLedger } = useMyLedger(ledgerOffset);

  const ledgerTotal = ledger?.total ?? 0;
  const ledgerPage = Math.floor(ledgerOffset / LEDGER_PAGE) + 1;
  const ledgerPages = Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE));
  const firstAd = adFeed?.ads?.[0];

  return (
    <DashboardLayout title="Review ads">
      <div className="space-y-6 max-w-5xl">

        {/* Compact balance + primary action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-black/10 bg-white p-5">
          <div>
            <p className="text-xs font-medium text-[#9ca3af] uppercase tracking-wide">Your points</p>
            <p className="text-3xl sm:text-4xl font-bold text-[#0f0f14] tabular-nums mt-1">
              {loadingBalance ? "—" : (balance?.balance ?? 0).toLocaleString()}
              <span className="text-base font-medium text-[#9ca3af] ml-1">pts</span>
            </p>
          </div>
          {firstAd ? (
            <Link href={`/review/${firstAd.id}`}>
              <span className="btn btn-green cursor-pointer inline-flex items-center gap-2 h-12 px-6 text-sm font-bold">
                Start reviewing <ArrowRight size={16} />
              </span>
            </Link>
          ) : null}
        </div>

        {eligibility && !eligibility.eligible && (
          <Link href="/profile">
            <div className="rounded-lg border border-[#f97316]/30 bg-[#f97316]/5 px-4 py-3 text-sm text-[#0f0f14]">
              <span className="font-semibold">Complete your profile</span> to join the leaderboard.
            </div>
          </Link>
        )}

        {/* Ads — front and center, no tabs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#0f0f14]">Available ads</h2>
            <Link href="/leaderboard" className="text-sm font-semibold text-[#f97316] hover:underline inline-flex items-center gap-1">
              <Trophy size={14} /> Leaderboard
            </Link>
          </div>

          {loadingFeed ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="rounded-lg border border-black/10 bg-white overflow-hidden animate-pulse">
                  <div className="aspect-video bg-[#f0f0f0]" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-[#f0f0f0] w-1/3 rounded" />
                    <div className="h-4 bg-[#f0f0f0] w-3/4 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : adFeed?.ads && adFeed.ads.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {adFeed.ads.map(ad => {
                const multiplier = parseFloat(String(ad.multiplierFactor));
                const hasMultiplier = multiplier > 1.0;
                const thumbUrl = getAdThumbUrl(ad.assetType ?? "", ad.assetUrl ?? "");

                return (
                  <Link key={ad.id} href={`/review/${ad.id}`}>
                    <div className="group rounded-lg border border-black/10 bg-white overflow-hidden hover:border-[#f97316]/40 hover:shadow-md transition-all cursor-pointer">
                      <div className="relative aspect-video bg-[#0f0f14]">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt={ad.title}
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="absolute inset-0 gradient-bg opacity-25" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                          <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center">
                            <Play size={16} className="text-[#0f0f14] ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-1.5">
                          <span className="bg-black/60 text-white text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1">
                            <Clock size={9} /> {ad.minWatchSeconds}s
                          </span>
                          {hasMultiplier && (
                            <span className="bg-[#f9ca24] text-[#0f0f14] text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <Zap size={8} /> {multiplier.toFixed(1)}×
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-[10px] font-medium text-[#9ca3af] uppercase tracking-wide">{ad.brandName}</p>
                        <h3 className="text-sm font-semibold text-[#0f0f14] line-clamp-2 mt-1 mb-2">{ad.title}</h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Star size={12} className="fill-[#f9ca24] text-[#f9ca24]" />
                            <span className="text-sm font-bold">+{ad.pointReward} pts</span>
                          </div>
                          <span className="text-xs font-semibold text-[#f97316]">Review →</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/15 py-16 text-center bg-white">
              <Play size={28} className="text-[#d1d5db] mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No ads right now</h3>
              <p className="text-sm text-[#9ca3af]">Check back soon for new campaigns.</p>
            </div>
          )}
        </section>

        {/* Leaderboard preview — secondary */}
        {leaderboard?.entries && leaderboard.entries.length > 0 && (
          <section className="rounded-lg border border-black/10 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0f0f14]">This week's top reviewers</h2>
              <Link href="/leaderboard" className="text-xs font-semibold text-[#f97316]">View all</Link>
            </div>
            <div className="divide-y divide-black/5">
              {leaderboard.entries.slice(0, 5).map(entry => (
                <div key={entry.userId}
                  className={`flex items-center justify-between px-4 py-3 ${entry.isCurrentUser ? "bg-[#f97316]/5" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded ${
                      entry.rank <= 3 ? "bg-[#f9ca24] text-[#0f0f14]" : "bg-[#f0f0f0] text-[#9ca3af]"
                    }`}>
                      {entry.rank}
                    </span>
                    <span className={`text-sm ${entry.isCurrentUser ? "font-semibold text-[#f97316]" : ""}`}>
                      {entry.isCurrentUser ? "You" : entry.username}
                    </span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{entry.pointsTotal.toLocaleString()} pts</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Earnings — collapsible */}
        <section className="rounded-lg border border-black/10 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setShowEarnings(!showEarnings)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#fafafa] transition-colors"
          >
            <span className="text-sm font-semibold text-[#0f0f14]">Points history</span>
            <span className="text-xs text-[#9ca3af]">{showEarnings ? "Hide" : "Show"}</span>
          </button>

          {showEarnings && (
            <div className="border-t border-black/5">
              {loadingLedger ? (
                <div className="py-10 text-center text-sm text-[#9ca3af]">Loading…</div>
              ) : ledger?.entries.length === 0 ? (
                <div className="py-10 text-center">
                  <Coins size={24} className="text-[#d1d5db] mx-auto mb-2" />
                  <p className="text-sm text-[#9ca3af]">No earnings yet. Review your first ad to get started.</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-black/5">
                    {ledger?.entries.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{SOURCE_LABEL[entry.source] ?? entry.source}</p>
                          <p className="text-xs text-[#9ca3af]">
                            {new Date(entry.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                        <span className={`text-sm font-bold tabular-nums ${entry.amount > 0 ? "text-[#f97316]" : "text-red-500"}`}>
                          {entry.amount > 0 ? "+" : ""}{entry.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                  {ledgerPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t border-black/5 bg-[#fafafa]">
                      <span className="text-xs text-[#9ca3af]">Page {ledgerPage} of {ledgerPages}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setLedgerOffset(Math.max(0, ledgerOffset - LEDGER_PAGE))}
                          disabled={ledgerOffset === 0}
                          className="w-7 h-7 flex items-center justify-center border rounded disabled:opacity-40"
                        >
                          <ChevronLeft size={12} />
                        </button>
                        <button
                          onClick={() => setLedgerOffset(ledgerOffset + LEDGER_PAGE)}
                          disabled={ledgerOffset + LEDGER_PAGE >= ledgerTotal}
                          className="w-7 h-7 flex items-center justify-center border rounded disabled:opacity-40"
                        >
                          <ChevronRightIcon size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

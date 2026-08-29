import { useState } from "react";
import { DashboardLayout } from "@earn/components/layout/DashboardLayout";
import { useGetBrandOverview, useGetBrandAds } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@earn/components/ui/card";
import { Button } from "@earn/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@earn/components/ui/tabs";
import { PlusCircle, Activity, Video, Users, CheckCircle2, TrendingUp, Star, BarChart3, Globe2, Briefcase, MessageSquare, Loader2, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line, CartesianGrid, Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────
interface DemoBucket { label: string; count: number; pct: number }
interface SurveyInsight {
  questionId: string; adId: string; questionText: string; questionType: string;
  totalAnswers: number; avgRating: number | null;
  distribution: Array<{ option: string; count: number; pct: number }>;
  samples: string[];
}
interface AdPerf { id: string; title: string; status: string; total: number; completed: number }
interface Analytics {
  hasCampaigns: boolean;
  overview: { totalViews: number; totalCompletions: number; completionRate: number; avgWatchSeconds: number; totalPoints: number };
  demographics: { gender: DemoBucket[]; ageBand: DemoBucket[]; state: DemoBucket[]; employmentStatus: DemoBucket[]; totalProfiled: number };
  surveyInsights: SurveyInsight[];
  adsPerformance: AdPerf[];
  trend: Array<{ date: string; completions: number }>;
}

const BRAND_COLORS = ["#e91e8c", "#ff6b00", "#f9ca24", "#f97316", "#0071e3", "#7950f2", "#20c997", "#ff4d4f"];
const GENDER_COLORS: Record<string, string> = { male: "#0071e3", female: "#e91e8c" };
const GENDER_LABELS: Record<string, string> = { male: "Male", female: "Female" };

function useAnalytics() {
  return useQuery<Analytics>({
    queryKey: ["brand-analytics"],
    queryFn: () => customFetch<Analytics>("/api/brands/analytics"),
    staleTime: 30_000,
  });
}

// ─── Score Gauge ─────────────────────────────────────────────────────────────
function ScoreGauge({ value, max = 5, label, color = "#e91e8c" }: { value: number | null; max?: number; label: string; color?: string }) {
  const pct = value !== null ? (value / max) * 100 : 0;
  const displayVal = value !== null ? value.toFixed(1) : "—";
  return (
    <div className="text-center">
      <div className="relative w-20 h-20 mx-auto mb-2">
        <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} 100`} strokeLinecap="round" className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[18px] font-black text-[#0f0f14]">{displayVal}</span>
        </div>
      </div>
      <p className="text-[12px] font-medium text-[#6b7280] leading-snug">{label}</p>
    </div>
  );
}

// ─── Mini Bar ────────────────────────────────────────────────────────────────
function MiniBar({ label, pct, count, color }: { label: string; pct: number; count: number; color: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[13px] text-[#374151] w-28 shrink-0 capitalize truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-[#f3f4f6] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[12px] font-bold text-[#374151] w-10 text-right shrink-0">{pct}%</span>
      <span className="text-[11px] text-[#9ca3af] w-6 shrink-0">({count})</span>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = "#e91e8c" }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-black/[0.07] p-6">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[12px] font-bold uppercase tracking-wider text-[#6b7280]">{label}</span>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="text-[32px] font-black tracking-[-0.03em] text-[#0f0f14] leading-none mb-1">{value}</div>
      {sub && <p className="text-[12px] text-[#9ca3af] font-medium mt-1">{sub}</p>}
    </div>
  );
}

// ─── No-data placeholder ─────────────────────────────────────────────────────
function NoData({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertCircle size={24} className="text-[#d1d5db] mb-2" />
      <p className="text-[13px] text-[#9ca3af]">{message}</p>
    </div>
  );
}

// ─── Survey question block ────────────────────────────────────────────────────
function SurveyQuestionCard({ q, index }: { q: SurveyInsight; index: number }) {
  if (q.totalAnswers === 0) return null;

  return (
    <div className="bg-white border border-black/[0.07] p-5">
      <p className="text-[12px] font-bold uppercase tracking-wider text-[#9ca3af] mb-1">Q{index + 1}</p>
      <p className="text-[14px] font-semibold text-[#0f0f14] mb-3 leading-snug">{q.questionText}</p>
      <p className="text-[11px] text-[#9ca3af] mb-3">{q.totalAnswers} response{q.totalAnswers !== 1 ? "s" : ""}</p>

      {q.questionType === "rating" && q.avgRating !== null && (
        <div className="flex items-center gap-3">
          <div className="text-[28px] font-black text-[#0f0f14]">{q.avgRating.toFixed(1)}</div>
          <div>
            <div className="flex gap-0.5 mb-0.5">
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} className="w-4 h-4 rounded-sm" style={{ backgroundColor: s <= Math.round(q.avgRating!) ? "#e91e8c" : "#f3f4f6" }} />
              ))}
            </div>
            <p className="text-[11px] text-[#9ca3af]">avg out of 5</p>
          </div>
        </div>
      )}

      {(q.questionType === "multiple_choice" || q.questionType === "yes_no" || q.questionType === "emoji") && q.distribution.length > 0 && (
        <div className="space-y-1.5">
          {q.distribution.map((d, i) => (
            <div key={d.option}>
              <div className="flex justify-between text-[12px] mb-0.5">
                <span className="text-[#374151] font-medium truncate mr-2">{d.option}</span>
                <span className="text-[#0f0f14] font-bold shrink-0">{d.pct}%</span>
              </div>
              <div className="h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${d.pct}%`, backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {q.questionType === "open_text" && q.samples.length > 0 && (
        <div className="space-y-2">
          {q.samples.map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[#e91e8c] mt-0.5 shrink-0">›</span>
              <p className="text-[13px] text-[#374151] italic leading-snug">"{s}"</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BrandPortal() {
  const { data: stats, isLoading: loadingStats } = useGetBrandOverview();
  const { data: adsFeed, isLoading: loadingAds } = useGetBrandAds();
  const { data: analytics, isLoading: loadingAnalytics } = useAnalytics();
  const [activeAdTab, setActiveAdTab] = useState<string | null>(null);

  // Find key survey questions across all ads
  const allInsights = analytics?.surveyInsights ?? [];
  const clarityInsights = allInsights.filter(q => q.questionText.toLowerCase().includes("clearly") && q.questionType === "rating");
  const intentInsights = allInsights.filter(q => q.questionText.toLowerCase().includes("likely") && q.questionType === "rating");
  const awarenessInsights = allInsights.filter(q => q.questionText.toLowerCase().includes("familiar") && q.questionType === "multiple_choice");
  const perceptionInsights = allInsights.filter(q => q.questionText.toLowerCase().includes("impression") && q.questionType === "multiple_choice");
  const emotionInsights = allInsights.filter(q => q.questionText.toLowerCase().includes("feel") && q.questionType === "multiple_choice");

  const avgClarity = clarityInsights.length > 0 && clarityInsights[0]!.avgRating !== null ? clarityInsights[0]!.avgRating : null;
  const avgIntent = intentInsights.length > 0 && intentInsights[0]!.avgRating !== null ? intentInsights[0]!.avgRating : null;

  const topPerceptionPositive = perceptionInsights.length > 0
    ? perceptionInsights[0]!.distribution.filter(d => d.option.toLowerCase().includes("positive")).reduce((s, d) => s + d.pct, 0)
    : null;

  const topEmotion = emotionInsights.length > 0 && emotionInsights[0]!.distribution.length > 0
    ? emotionInsights[0]!.distribution[0]!.option
    : null;

  const topAwarenessNew = awarenessInsights.length > 0
    ? awarenessInsights[0]!.distribution.find(d => d.option.toLowerCase().includes("never"))?.pct ?? null
    : null;

  return (
    <DashboardLayout title="Brand Analytics">
      <div className="space-y-0 border border-black/[0.07]">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-white px-8 py-6 border-b border-black/[0.07] flex items-center justify-between">
          <div>
            <h2 className="text-[26px] font-black tracking-[-0.03em] text-[#0f0f14]">Analytics Dashboard</h2>
            <p className="text-[13px] text-[#6b7280] font-medium mt-0.5">Real Nigerian audience insights from verified reviews</p>
          </div>
          <Link href="/brand/campaigns/new">
            <button className="btn btn-green gap-2 text-[13px]">
              <PlusCircle size={14} /> New Campaign
            </button>
          </Link>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-black/[0.07]">
          <StatCard icon={Users} label="Total Views" value={loadingStats ? "…" : (stats?.totalViews || 0).toLocaleString()} sub="Across all campaigns" color="#e91e8c" />
          <StatCard icon={CheckCircle2} label="Completed Reviews" value={loadingStats ? "…" : (stats?.totalCompletions || 0).toLocaleString()} sub="Full watch + answered" color="#f97316" />
          <StatCard icon={Activity} label="Completion Rate" value={loadingStats ? "…" : `${((stats?.overallCompletionRate || 0) * 100).toFixed(0)}%`} sub="Average across ads" color="#0071e3" />
          <StatCard icon={Video} label="Active Campaigns" value={loadingStats ? "…" : stats?.activeAds || 0} sub={`of ${stats?.totalAds || 0} total`} color="#ff6b00" />
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="analytics" className="bg-white">
          <div className="border-b border-black/[0.07] px-8">
            <TabsList className="h-auto p-0 bg-transparent gap-0 rounded-none">
              {[
                { value: "analytics", label: "Audience & Survey" },
                { value: "campaigns", label: "My Campaigns" },
              ].map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#e91e8c] data-[state=active]:text-[#e91e8c] data-[state=active]:bg-transparent text-[13px] font-semibold px-5 py-4 text-[#6b7280] transition-all">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ── Analytics tab ─────────────────────────────────────────────── */}
          <TabsContent value="analytics" className="p-8 space-y-8 mt-0">
            {loadingAnalytics ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={28} className="animate-spin text-[#e91e8c]" />
              </div>
            ) : !analytics?.hasCampaigns ? (
              <div className="text-center py-16">
                <Video size={40} className="mx-auto text-[#d1d5db] mb-4" />
                <h3 className="text-[18px] font-bold text-[#0f0f14] mb-2">No campaigns yet</h3>
                <p className="text-[14px] text-[#6b7280] mb-6">Launch your first campaign to start seeing audience analytics here.</p>
                <Link href="/brand/campaigns/new"><button className="btn btn-green">Create Campaign</button></Link>
              </div>
            ) : (
              <>
                {/* ── Key scores ──────────────────────────────────────────── */}
                <div>
                  <h3 className="text-[14px] font-black uppercase tracking-wider text-[#0f0f14]/50 mb-4">Key Brand Metrics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-black/[0.07]">
                    <div className="bg-white p-6 text-center">
                      <ScoreGauge value={avgClarity} label="Message Clarity" color="#e91e8c" />
                    </div>
                    <div className="bg-white p-6 text-center">
                      <ScoreGauge value={avgIntent} label="Purchase Intent" color="#0071e3" />
                    </div>
                    <div className="bg-white p-6 flex flex-col items-center justify-center">
                      <div className="text-[32px] font-black text-[#0f0f14] mb-1">
                        {topPerceptionPositive !== null ? `${topPerceptionPositive}%` : "—"}
                      </div>
                      <p className="text-[12px] font-medium text-[#6b7280] text-center">Positive Brand Impression</p>
                    </div>
                    <div className="bg-white p-6 flex flex-col items-center justify-center">
                      <div className="text-[32px] font-black text-[#0f0f14] mb-1">
                        {topAwarenessNew !== null ? `${topAwarenessNew}%` : "—"}
                      </div>
                      <p className="text-[12px] font-medium text-[#6b7280] text-center">Net New Audience (never heard before)</p>
                    </div>
                  </div>
                </div>

                {/* ── 14-day trend ─────────────────────────────────────────── */}
                {analytics.trend.length > 0 && (
                  <div>
                    <h3 className="text-[14px] font-black uppercase tracking-wider text-[#0f0f14]/50 mb-4">Completions — Last 14 Days</h3>
                    <div className="bg-white border border-black/[0.07] p-6">
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={analytics.trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip labelFormatter={d => `Date: ${d}`} />
                          <Line type="monotone" dataKey="completions" stroke="#e91e8c" strokeWidth={2.5} dot={{ r: 3, fill: "#e91e8c" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* ── Demographics ─────────────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[14px] font-black uppercase tracking-wider text-[#0f0f14]/50">Audience Demographics</h3>
                    <span className="text-[12px] text-[#9ca3af] font-medium">{analytics.demographics.totalProfiled} profiled reviewers</span>
                  </div>

                  {analytics.demographics.totalProfiled === 0 ? (
                    <div className="bg-white border border-black/[0.07] p-8">
                      <NoData message="Demographic data will appear here once reviewers complete their profiles." />
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-px bg-black/[0.07]">

                      {/* Gender */}
                      <div className="bg-white p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Users size={15} className="text-[#e91e8c]" />
                          <span className="text-[13px] font-bold text-[#0f0f14]">Gender</span>
                        </div>
                        {analytics.demographics.gender.length > 0 ? (
                          <div className="flex items-center gap-6">
                            <div className="w-32 h-32 shrink-0">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={analytics.demographics.gender.map(g => ({ ...g, name: GENDER_LABELS[g.label] ?? g.label }))} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="count" nameKey="name">
                                    {analytics.demographics.gender.map((g, i) => (
                                      <Cell key={g.label} fill={GENDER_COLORS[g.label] ?? BRAND_COLORS[i % BRAND_COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(v: any, n: any) => [v, n]} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex-1 space-y-1">
                              {analytics.demographics.gender.map((g, i) => (
                                <div key={g.label} className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GENDER_COLORS[g.label] ?? BRAND_COLORS[i] }} />
                                  <span className="text-[13px] text-[#374151] flex-1 capitalize">{GENDER_LABELS[g.label] ?? g.label}</span>
                                  <span className="text-[13px] font-bold text-[#0f0f14]">{g.pct}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : <NoData message="No gender data yet." />}
                      </div>

                      {/* Age Band */}
                      <div className="bg-white p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <BarChart3 size={15} className="text-[#0071e3]" />
                          <span className="text-[13px] font-bold text-[#0f0f14]">Age Group</span>
                        </div>
                        {analytics.demographics.ageBand.length > 0 ? (
                          <div className="space-y-1">
                            {analytics.demographics.ageBand.map((b, i) => (
                              <MiniBar key={b.label} label={b.label} pct={b.pct} count={b.count} color={BRAND_COLORS[i % BRAND_COLORS.length]!} />
                            ))}
                          </div>
                        ) : <NoData message="No age data yet." />}
                      </div>

                      {/* Employment */}
                      <div className="bg-white p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Briefcase size={15} className="text-[#f97316]" />
                          <span className="text-[13px] font-bold text-[#0f0f14]">Employment Status</span>
                        </div>
                        {analytics.demographics.employmentStatus.length > 0 ? (
                          <div className="space-y-1">
                            {analytics.demographics.employmentStatus.map((e, i) => (
                              <MiniBar key={e.label} label={e.label} pct={e.pct} count={e.count} color={BRAND_COLORS[(i + 2) % BRAND_COLORS.length]!} />
                            ))}
                          </div>
                        ) : <NoData message="No employment data yet." />}
                      </div>

                      {/* State */}
                      <div className="bg-white p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Globe2 size={15} className="text-[#ff6b00]" />
                          <span className="text-[13px] font-bold text-[#0f0f14]">Top States</span>
                        </div>
                        {analytics.demographics.state.length > 0 ? (
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={analytics.demographics.state.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                              <XAxis type="number" tick={{ fontSize: 10 }} hide />
                              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={90} />
                              <Tooltip formatter={(v: any) => [`${v} reviewers`]} />
                              <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                                {analytics.demographics.state.slice(0, 8).map((_, i) => (
                                  <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : <NoData message="No location data yet." />}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Emotion & Perception highlights ───────────────────────── */}
                {(emotionInsights.length > 0 || perceptionInsights.length > 0) && (
                  <div>
                    <h3 className="text-[14px] font-black uppercase tracking-wider text-[#0f0f14]/50 mb-4">Sentiment Snapshot</h3>
                    <div className="grid md:grid-cols-2 gap-px bg-black/[0.07]">
                      {emotionInsights.length > 0 && emotionInsights[0]!.distribution.length > 0 && (
                        <div className="bg-white p-6">
                          <p className="text-[13px] font-bold text-[#0f0f14] mb-3">Top Emotional Response</p>
                          <div className="flex items-center gap-4 mb-4">
                            <div className="text-[40px] font-black text-[#e91e8c]">{emotionInsights[0]!.distribution[0]!.pct}%</div>
                            <div>
                              <p className="text-[16px] font-bold text-[#0f0f14]">{emotionInsights[0]!.distribution[0]!.option}</p>
                              <p className="text-[12px] text-[#9ca3af]">of respondents</p>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {emotionInsights[0]!.distribution.map((d, i) => (
                              <MiniBar key={d.option} label={d.option} pct={d.pct} count={d.count} color={BRAND_COLORS[i % BRAND_COLORS.length]!} />
                            ))}
                          </div>
                        </div>
                      )}
                      {perceptionInsights.length > 0 && perceptionInsights[0]!.distribution.length > 0 && (
                        <div className="bg-white p-6">
                          <p className="text-[13px] font-bold text-[#0f0f14] mb-3">Brand Impression Shift</p>
                          <div className="space-y-1.5">
                            {perceptionInsights[0]!.distribution.map((d, i) => (
                              <MiniBar key={d.option} label={d.option} pct={d.pct} count={d.count} color={BRAND_COLORS[i % BRAND_COLORS.length]!} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Survey Q&A deep dive ─────────────────────────────────── */}
                <div>
                  <h3 className="text-[14px] font-black uppercase tracking-wider text-[#0f0f14]/50 mb-4">
                    Survey Question Breakdown
                    <span className="ml-2 text-[11px] normal-case text-[#9ca3af] font-normal">({allInsights.length} questions across all ads)</span>
                  </h3>
                  {allInsights.filter(q => q.totalAnswers > 0).length === 0 ? (
                    <div className="bg-white border border-black/[0.07] p-8">
                      <NoData message="Survey responses will appear here once reviewers complete reviews." />
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-px bg-black/[0.07]">
                      {allInsights.filter(q => q.totalAnswers > 0).map((q, i) => (
                        <SurveyQuestionCard key={q.questionId} q={q} index={i} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Campaigns tab ─────────────────────────────────────────────── */}
          <TabsContent value="campaigns" className="p-8 space-y-6 mt-0">
            {loadingAds ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[#e91e8c]" /></div>
            ) : adsFeed?.ads && adsFeed.ads.length > 0 ? (
              <>
                {/* Perf chart */}
                {analytics?.adsPerformance && analytics.adsPerformance.some(a => a.total > 0) && (
                  <div className="bg-white border border-black/[0.07] p-6">
                    <p className="text-[13px] font-bold text-[#0f0f14] mb-4">Views vs Completions by Campaign</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={analytics.adsPerformance} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                        <XAxis dataKey="title" tick={{ fontSize: 10 }} tickFormatter={t => t.length > 18 ? t.slice(0, 18) + "…" : t} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="total" name="Total Views" fill="#e5e7eb" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="completed" name="Completed" fill="#e91e8c" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid gap-px bg-black/[0.07] md:grid-cols-2 lg:grid-cols-3">
                  {adsFeed.ads.map(ad => {
                    const perf = analytics?.adsPerformance.find(p => p.id === ad.id);
                    return (
                      <div key={ad.id} className="bg-white p-5 flex flex-col">
                        <div className="flex items-start justify-between mb-3">
                          <span className={`text-[10px] px-2 py-1 font-black uppercase tracking-wider ${ad.status === "active" ? "bg-[#f97316]/15 text-[#c2410c]" : ad.status === "draft" ? "bg-[#f3f4f6] text-[#9ca3af]" : "bg-amber-100 text-amber-700"}`}>
                            {ad.status}
                          </span>
                          {ad.averageRating !== null && (
                            <div className="flex items-center gap-1">
                              <Star size={11} className="fill-amber-400 text-amber-400" />
                              <span className="text-[12px] font-bold">{(ad.averageRating ?? 0).toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                        <h3 className="text-[15px] font-bold text-[#0f0f14] leading-snug mb-3">{ad.title}</h3>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-bold mb-0.5">Views</p>
                            <p className="text-[18px] font-black text-[#0f0f14]">{ad.totalViews}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-bold mb-0.5">Completed</p>
                            <p className="text-[18px] font-black text-[#0f0f14]">{ad.completedViews}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-bold mb-0.5">Completion %</p>
                            <p className="text-[18px] font-black text-[#0f0f14]">{((ad.completionRate || 0) * 100).toFixed(0)}%</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-bold mb-0.5">Avg Watch</p>
                            <p className="text-[18px] font-black text-[#0f0f14]">{ad.averageWatchSeconds ?? 0}s</p>
                          </div>
                        </div>
                        {/* Completion bar */}
                        <div className="mb-4">
                          <div className="h-1.5 bg-[#f3f4f6] overflow-hidden">
                            <div className="h-full bg-[#e91e8c] transition-all" style={{ width: `${Math.min(100, (ad.completionRate || 0) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="bg-white border border-black/[0.07] py-16 flex flex-col items-center text-center px-8">
                <Video size={36} className="text-[#d1d5db] mb-4" />
                <h3 className="text-[18px] font-bold text-[#0f0f14] mb-2">No campaigns yet</h3>
                <p className="text-[14px] text-[#6b7280] max-w-sm mb-6">Create your first campaign to get verified reviews and audience insights from real Nigerians.</p>
                <Link href="/brand/campaigns/new"><button className="btn btn-green">Create Campaign</button></Link>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

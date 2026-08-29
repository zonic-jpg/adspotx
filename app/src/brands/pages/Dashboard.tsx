import React, { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@brands/components/ui/card";
import { Button } from "@brands/components/ui/button";
import { Badge } from "@brands/components/ui/badge";
import { Skeleton } from "@brands/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@brands/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@brands/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@brands/components/ui/command";
import { Checkbox } from "@brands/components/ui/checkbox";
import {
  Eye, CheckCircle, TrendingUp, Zap, Users, DollarSign, MessageSquare,
  Plus, Star, RefreshCw, Sparkles, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Filter,
  BarChart3, Clock, MapPin, UserCheck, ThumbsUp,
} from "lucide-react";
import { AISummaryButton } from "@brands/components/AISummaryPanel";
import { BrandAnalytics } from "@brands/components/BrandAnalytics";

import { API_BASE } from "../../lib/apiBase";
const API = API_BASE;
const TOKEN_KEY = "adspot_brand_token";
const ORANGE = "#f97316";
// Vibrant modern palette (multi-hue) for lively, distinct data series.
const COLORS = ["#f97316", "#6366f1", "#06b6d4", "#ec4899", "#22c55e", "#eab308", "#8b5cf6", "#f43f5e"];
const GRADIENTS = [
  ["#f97316", "#fb923c"], ["#6366f1", "#818cf8"], ["#06b6d4", "#22d3ee"],
  ["#ec4899", "#f472b6"], ["#22c55e", "#4ade80"], ["#eab308", "#facc15"],
];
const PIE_COLORS = { male: "#6366f1", female: "#ec4899" };

const NIGERIAN_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT – Abuja","Gombe",
  "Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos",
  "Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto",
  "Taraba","Yobe","Zamfara",
];

type Filters = {
  adId: string;
  gender: string;
  ageBand: string;
  state: string[];
  timeOfDay: string;
};

type Theme = {
  label: string;
  sentiment: "positive" | "neutral" | "negative";
  count: number;
  summary: string;
  topComment: string;
  commentIndices?: number[];
};

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem(TOKEN_KEY);
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function buildQS(filters: Filters) {
  const p = new URLSearchParams();
  if (filters.adId && filters.adId !== "all") p.set("adId", filters.adId);
  if (filters.gender && filters.gender !== "all") p.set("gender", filters.gender);
  if (filters.ageBand && filters.ageBand !== "all") p.set("ageBand", filters.ageBand);
  if (filters.state.length > 0) p.set("state", filters.state.join(","));
  if (filters.timeOfDay && filters.timeOfDay !== "all") p.set("timeOfDay", filters.timeOfDay);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const SENTIMENT_COLOR: Record<string, string> = { positive: "#22c55e", neutral: "#f59e0b", negative: "#ef4444" };

function KpiCard({ title, value, sub, icon: Icon, loading, accent }: {
  title: string; value?: string; sub?: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  loading: boolean; accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-orange-200 bg-orange-50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${accent ? "text-orange-500" : "text-muted-foreground"}`} size={16} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className={`text-2xl font-bold ${accent ? "text-orange-600" : "text-foreground"}`}>{value ?? "—"}</div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SentimentBadge({ s }: { s: string }) {
  const color = SENTIMENT_COLOR[s] ?? "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border"
      style={{ color, borderColor: color, background: `${color}15` }}>
      {s === "positive" ? "👍" : s === "negative" ? "👎" : "😐"} {s}
    </span>
  );
}

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({ adId: "all", gender: "all", ageBand: "all", state: [], timeOfDay: "all" });
  const [showAllComments, setShowAllComments] = useState(false);
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [expandedThemes, setExpandedThemes] = useState<Set<number>>(new Set());

  const qs = buildQS(filters);

  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery({
    queryKey: ["brand-analytics", qs],
    queryFn: () => apiFetch(`/brands/analytics${qs}`),
    staleTime: 30000,
  });

  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ["brand-comments", qs],
    queryFn: () => apiFetch(`/brands/analytics/comments${qs}`),
    staleTime: 30000,
  });

  const organizeMutation = useMutation({
    mutationFn: (comments: { comment: string; reviewer?: Record<string, string> }[]) =>
      apiFetch("/brands/analytics/organize-comments", { method: "POST", body: JSON.stringify({ comments }) }),
    onSuccess: (data) => setThemes(data.themes ?? []),
  });

  const handleOrganize = useCallback(() => {
    const list = (commentsData?.comments ?? []).slice(0, 100).map((c: { comment: string; reviewer?: Record<string, string> }) => ({
      comment: c.comment,
      reviewer: c.reviewer,
    }));
    if (list.length > 0) organizeMutation.mutate(list);
  }, [commentsData, organizeMutation]);

  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters(f => ({ ...f, [k]: v }));

  const toggleState = (s: string) => setFilters(f => ({
    ...f,
    state: f.state.includes(s) ? f.state.filter(x => x !== s) : [...f.state, s],
  }));

  const hasFilters = filters.adId !== "all" || filters.gender !== "all" || filters.ageBand !== "all" || filters.state.length > 0 || filters.timeOfDay !== "all";

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkScroll]);

  const loading = analyticsLoading;
  const ov = analytics?.overview;
  const demo = analytics?.demographics;
  const allAds: Array<{ id: string; title: string; status: string }> = analytics?.allAds ?? [];
  const comments: Array<{ id: string; comment: string; completedAt: string; adTitle: string; reviewer: { username: string; gender: string | null; ageBand: string | null; state: string | null } }> = commentsData?.comments ?? [];
  const visibleComments = showAllComments ? comments : comments.slice(0, 8);

  const genderData = (demo?.gender ?? []).map((g: { label: string; count: number; pct: number }) => ({
    ...g,
    name: g.label.replace(/_/g, " "),
    fill: PIE_COLORS[g.label as keyof typeof PIE_COLORS] ?? ORANGE,
  }));

  const ageBandData = (demo?.ageBand ?? []).map((b: { label: string; count: number; pct: number }) => ({
    name: b.label,
    reviewers: b.count,
    pct: b.pct,
  }));

  const stateData = (demo?.state ?? [])
    .slice(0, 12)
    .map((s: { label: string; count: number; pct: number }) => ({ name: s.label, reviewers: s.count }))
    .reverse();

  const todData = (demo?.timeOfDay ?? []).map((t: { label: string; count: number }) => ({
    name: t.label,
    completions: t.count,
  }));

  const surveyInsights: Array<{
    questionId: string;
    adId: string;
    questionText: string;
    questionType: string;
    totalAnswers: number;
    avgRating: number | null;
    positivityScore: number | null;
    distribution: Array<{ option: string; count: number; pct: number }>;
    samples: string[];
  }> = analytics?.surveyInsights ?? [];

  const trendData = (() => {
    const last14: { date: string; completions: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const found = (analytics?.trend ?? []).find((t: { date: string; completions: number }) => String(t.date).slice(0, 10) === dateStr);
      last14.push({ date: d.toLocaleDateString("en-NG", { month: "short", day: "numeric" }), completions: found?.completions ?? 0 });
    }
    return last14;
  })();

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Campaign Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time performance insights for your Nigerian audience</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AISummaryButton />
          <Button variant="outline" size="sm" onClick={() => refetchAnalytics()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Link href="/ads/new">
            <Button size="sm" className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="h-3.5 w-3.5" /> New Campaign
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className={`border ${hasFilters ? "border-orange-300 bg-orange-50/50" : ""}`}>
        <CardContent className="pt-3 pb-3">
          <div className="relative">
            {canScrollLeft && (
              <button
                aria-label="Scroll filters left"
                onClick={() => scrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 bg-gray-700 text-white rounded-sm shadow-md"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          <div ref={scrollRef} className="overflow-x-auto filter-scrollbar pb-1.5" onScroll={checkScroll}>
          <div className="flex items-center gap-2 min-w-max">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mr-1">
              <Filter className="h-4 w-4" /> Filters:
            </div>

            <Select value={filters.adId} onValueChange={v => setFilter("adId", v)}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="All Campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {allAds.map(ad => (
                  <SelectItem key={ad.id} value={ad.id}>{ad.title.slice(0, 30)}{ad.title.length > 30 ? "…" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.gender} onValueChange={v => setFilter("gender", v)}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue placeholder="Gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genders</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.ageBand} onValueChange={v => setFilter("ageBand", v)}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Age Band" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ages</SelectItem>
                <SelectItem value="18_24">18–24</SelectItem>
                <SelectItem value="25_34">25–34</SelectItem>
                <SelectItem value="35_44">35–44</SelectItem>
                <SelectItem value="45_54">45–54</SelectItem>
                <SelectItem value="55_plus">55+</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs font-normal gap-1.5 min-w-[130px] justify-between">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {filters.state.length === 0
                      ? "All States"
                      : filters.state.length === 1
                        ? filters.state[0]
                        : `${filters.state.length} States`}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search states…" className="h-8 text-xs" />
                  <CommandList className="max-h-[220px]">
                    <CommandEmpty className="text-xs text-center py-3 text-muted-foreground">No state found</CommandEmpty>
                    <CommandGroup>
                      {NIGERIAN_STATES.map(s => (
                        <CommandItem key={s} value={s} onSelect={() => toggleState(s)} className="text-xs gap-2 cursor-pointer">
                          <Checkbox
                            checked={filters.state.includes(s)}
                            className="h-3.5 w-3.5 pointer-events-none"
                          />
                          {s}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                  {filters.state.length > 0 && (
                    <div className="border-t p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-xs text-orange-600 hover:text-orange-700"
                        onClick={() => setFilter("state", [])}
                      >
                        Clear states
                      </Button>
                    </div>
                  )}
                </Command>
              </PopoverContent>
            </Popover>

            <Select value={filters.timeOfDay} onValueChange={v => setFilter("timeOfDay", v)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Time of Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Time</SelectItem>
                <SelectItem value="morning">Morning (6–12)</SelectItem>
                <SelectItem value="afternoon">Afternoon (12–17)</SelectItem>
                <SelectItem value="evening">Evening (17–21)</SelectItem>
                <SelectItem value="night">Night (21–6)</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-orange-600 hover:text-orange-700"
                onClick={() => setFilters({ adId: "all", gender: "all", ageBand: "all", state: [], timeOfDay: "all" })}>
                Clear all
              </Button>
            )}
          </div>
          </div>
            {canScrollRight && (
              <button
                aria-label="Scroll filters right"
                onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 bg-gray-700 text-white rounded-sm shadow-md"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
        <KpiCard title="Total Views"      value={ov?.totalViews?.toLocaleString()}                                         icon={Eye}        loading={loading} />
        <KpiCard title="Completions"      value={ov?.totalCompletions?.toLocaleString()}                                   icon={CheckCircle} loading={loading} accent />
        <KpiCard title="Completion Rate"  value={ov ? `${(ov.completionRate * 100).toFixed(1)}%` : undefined}              icon={TrendingUp}  loading={loading} />
        <KpiCard title="Avg Watch Time"   value={ov ? `${ov.avgWatchSeconds}s` : undefined}                                icon={Clock}       loading={loading} />
        <KpiCard title="Points Spent"     value={ov?.totalPoints?.toLocaleString()}                                        icon={DollarSign}  loading={loading} sub="total cost in pts" />
        <KpiCard title="Engagement"       value={ov ? `${ov.engagementRate}%` : undefined}                                 icon={Zap}         loading={loading} accent sub="completion rate" />
      </div>

      {/* Charts Row 1: Trend + Gender + Completion gauge */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">14-Day Completion Trend</CardTitle>
            <CardDescription className="text-xs">Daily completions over the past 2 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="completionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ORANGE} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={ORANGE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <Area type="monotone" dataKey="completions" stroke={ORANGE} strokeWidth={2.5} fill="url(#completionGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" /> Gender Split</CardTitle>
            <CardDescription className="text-xs">{demo?.totalProfiled ?? 0} profiled reviewers</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : genderData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No demographic data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={genderData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="count">
                    {genderData.map((entry: { label: string; count: number; pct: number; fill: string }, i: number) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v} reviewers`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend iconType="circle" iconSize={10} formatter={(v: unknown) => String(v ?? "").replace(/_/g, " ")} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-muted-foreground" /> Completion Rate</CardTitle>
            <CardDescription className="text-xs">Share of views that finish</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={200}>
                  <RadialBarChart
                    innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270}
                    data={[{ name: "completion", value: Math.round((ov?.completionRate ?? 0) * 100), fill: "url(#gaugeGrad)" }]}
                  >
                    <defs>
                      <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="50%" stopColor="#ec4899" />
                        <stop offset="100%" stopColor="#f97316" />
                      </linearGradient>
                    </defs>
                    <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                    <RadialBar background={{ fill: "#f1f5f9" }} dataKey="value" cornerRadius={12} angleAxisId={0} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-bold bg-gradient-to-br from-indigo-500 via-pink-500 to-orange-500 bg-clip-text text-transparent">
                    {ov ? `${(ov.completionRate * 100).toFixed(0)}%` : "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">completed</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Age + State + Time of Day */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5"><UserCheck className="h-4 w-4 text-muted-foreground" /> Age Bands</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-44 w-full" /> : ageBandData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ageBandData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`${v} reviewers`]} />
                  <Bar dataKey="reviewers" fill={ORANGE} radius={[0, 4, 4, 0]}>
                    {ageBandData.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" /> Top States</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-44 w-full" /> : stateData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stateData} layout="vertical">
                  <defs>
                    <linearGradient id="stateGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} width={70} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`${v} reviewers`]} />
                  <Bar dataKey="reviewers" fill="url(#stateGrad)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5"><Clock className="h-4 w-4 text-muted-foreground" /> Time of Day</CardTitle>
            <CardDescription className="text-xs">When your audience is most active (Lagos time)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-44 w-full" /> : todData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={todData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`${v} completions`]} />
                  <Bar dataKey="completions" fill="#f97316" radius={[4, 4, 0, 0]}>
                    {todData.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deep audience analytics — filterable demographic breakdowns */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold tracking-tight mb-1">Audience Deep-Dive</h2>
        <p className="text-sm text-muted-foreground mb-4">Filter by any demographic to see who is actually completing your campaigns.</p>
        <BrandAnalytics />
      </div>

      {/* Campaign Performance Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Campaign Performance</CardTitle>
              <CardDescription className="text-xs mt-0.5">Completion rates and cost per review across your campaigns</CardDescription>
            </div>
            <Link href="/ads" className="text-xs text-orange-500 hover:underline font-medium">View all →</Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (analytics?.adsPerformance ?? []).length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <BarChart3 className="mx-auto h-8 w-8 mb-2 opacity-40" />
              No campaigns yet. <Link href="/ads/new" className="text-orange-500 underline">Create your first ad.</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Campaign</th>
                    <th className="text-right py-2 px-2 font-medium">Views</th>
                    <th className="text-right py-2 px-2 font-medium">Completions</th>
                    <th className="text-right py-2 px-2 font-medium">Rate</th>
                    <th className="text-right py-2 px-2 font-medium">Avg Watch</th>
                    <th className="text-right py-2 pl-2 font-medium">Cost/Review</th>
                    <th className="text-right py-2 pl-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.adsPerformance ?? []).map((ad: { id: string; title: string; status: string; total: number; completed: number; avgWatch: number; totalPoints: number; estCostPerReview: number }) => {
                    const rate = ad.total > 0 ? (ad.completed / ad.total) * 100 : 0;
                    const isGood = rate >= 60;
                    return (
                      <tr key={ad.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <Link href={`/ads/${ad.id}`} className="font-medium hover:text-orange-500 transition-colors line-clamp-1">
                            {ad.title}
                          </Link>
                        </td>
                        <td className="text-right py-2.5 px-2 tabular-nums text-muted-foreground">{ad.total.toLocaleString()}</td>
                        <td className="text-right py-2.5 px-2 tabular-nums font-medium">{ad.completed.toLocaleString()}</td>
                        <td className="text-right py-2.5 px-2">
                          <span className={`font-semibold ${isGood ? "text-green-600" : rate >= 30 ? "text-amber-600" : "text-red-500"}`}>
                            {rate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-right py-2.5 px-2 tabular-nums text-muted-foreground">{ad.avgWatch}s</td>
                        <td className="text-right py-2.5 pl-2 tabular-nums font-medium text-orange-600">{ad.estCostPerReview} pts</td>
                        <td className="text-right py-2.5 pl-2">
                          <Badge variant={ad.status === "active" ? "default" : "outline"} className={`text-xs ${ad.status === "active" ? "bg-orange-500 hover:bg-orange-600" : ""}`}>
                            {ad.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Question Performance */}
      {surveyInsights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-orange-500" />
              <div>
                <CardTitle className="text-base">Question Performance</CardTitle>
                <CardDescription className="text-xs mt-0.5">Ranked by positivity score — highest engagement questions first</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {surveyInsights.map((q, i) => (
                <div key={q.questionId} className="flex items-start gap-3 p-3 rounded-xl border bg-muted/20">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? "bg-orange-500 text-white" : i === 1 ? "bg-orange-300 text-orange-900" : "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2">{q.questionText}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5">
                      <span className="text-xs text-muted-foreground">{q.totalAnswers} responses</span>
                      {q.avgRating !== null && (
                        <span className="text-xs flex items-center gap-0.5 font-medium text-amber-600">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {q.avgRating.toFixed(1)} avg
                        </span>
                      )}
                      {q.positivityScore !== null && (
                        <span className={`text-xs font-semibold ${q.positivityScore >= 70 ? "text-green-600" : q.positivityScore >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {q.positivityScore}% positive
                        </span>
                      )}
                      {q.distribution.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Top: <span className="font-medium text-foreground">"{q.distribution[0]?.option}"</span> ({q.distribution[0]?.pct}%)
                        </span>
                      )}
                    </div>
                    {q.distribution.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {q.distribution.slice(0, 4).map(d => (
                          <div key={d.option} className="flex items-center gap-1">
                            <div className="h-1.5 rounded-full bg-orange-400" style={{ width: `${Math.max(d.pct * 0.6, 8)}px` }} />
                            <span className="text-xs text-muted-foreground">{d.option} {d.pct}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviewer Comments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-orange-500" />
              <div>
                <CardTitle className="text-base">Reviewer Comments</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {commentsData?.total ?? 0} freehand comments from your audience
                </CardDescription>
              </div>
            </div>
            {(commentsData?.total ?? 0) > 0 && (
              <Button
                size="sm"
                variant={themes ? "outline" : "default"}
                className={`gap-1.5 text-xs ${!themes ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`}
                onClick={handleOrganize}
                disabled={organizeMutation.isPending}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {organizeMutation.isPending ? "Organising…" : themes ? "Re-organise with AI" : "Organise with AI"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* AI Themes */}
          {themes && themes.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">AI-Identified Themes</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {themes.map((theme, i) => (
                  <div key={i} className="border rounded-xl p-4 bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-semibold text-sm text-foreground">{theme.label}</span>
                      <SentimentBadge s={theme.sentiment} />
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{theme.summary}</p>
                    <div className="bg-background border rounded-lg p-2.5 mb-2">
                      <p className="text-xs italic text-foreground/80">"{theme.topComment}"</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{theme.count} comment{theme.count !== 1 ? "s" : ""}</span>
                      <button
                        className="text-xs text-orange-500 hover:underline flex items-center gap-0.5"
                        onClick={() => setExpandedThemes(s => { const n = new Set(s); if (n.has(i)) { n.delete(i); } else { n.add(i); } return n; })}
                      >
                        {expandedThemes.has(i) ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More</>}
                      </button>
                    </div>
                    {expandedThemes.has(i) && theme.commentIndices && (
                      <div className="mt-2 space-y-1.5 border-t pt-2">
                        {theme.commentIndices.slice(0, 5).map(idx => {
                          const c = comments[idx - 1];
                          return c ? (
                            <p key={idx} className="text-xs text-muted-foreground bg-background rounded p-1.5">"{c.comment}"</p>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t pt-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">All Individual Comments</p>
              </div>
            </div>
          )}

          {/* Raw Comments Grid */}
          {commentsLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No comments yet. They appear here once reviewers leave feedback.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleComments.map(c => (
                  <div key={c.id} className="rounded-xl border bg-muted/10 p-3.5 hover:bg-muted/30 transition-colors">
                    <p className="text-sm text-foreground leading-relaxed mb-2">"{c.comment}"</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">@{c.reviewer.username}</span>
                      {c.reviewer.gender && <span className="capitalize">{c.reviewer.gender}</span>}
                      {c.reviewer.ageBand && <span>{c.reviewer.ageBand}</span>}
                      {c.reviewer.state && (
                        <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{c.reviewer.state}</span>
                      )}
                      <span className="ml-auto">{new Date(c.completedAt).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}</span>
                    </div>
                    <p className="text-xs text-orange-500 mt-1.5 font-medium truncate">{c.adTitle}</p>
                  </div>
                ))}
              </div>
              {comments.length > 8 && (
                <div className="mt-3 text-center">
                  <button
                    className="text-sm text-orange-500 hover:underline font-medium flex items-center gap-1 mx-auto"
                    onClick={() => setShowAllComments(v => !v)}
                  >
                    {showAllComments ? <><ChevronUp className="h-4 w-4" /> Show less</> : <><ChevronDown className="h-4 w-4" /> Show all {comments.length} comments</>}
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

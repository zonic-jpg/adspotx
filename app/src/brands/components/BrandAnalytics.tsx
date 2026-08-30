import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  RadialBarChart, RadialBar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { customFetch } from "@workspace/api-client-react";

async function apiGet<T = any>(path: string): Promise<T> {
  return customFetch(path.startsWith("/api") ? path : `/api${path}`);
}

const CHART = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
const PRIMARY = "hsl(25 95% 53%)";

interface Bucket { key: string; completions: number; avgWatch: number; avgWatchPct: number }
interface DeepData {
  totals: { completions: number; uniqueReviewers: number; avgWatch: number; avgWatchPct: number };
  breakdowns: Record<string, Bucket[]>;
  timeseries: Array<{ day: string; completions: number }>;
}
interface Filters {
  adId?: string; gender?: string; ageBand?: string; state?: string; city?: string;
  incomeBand?: string; deviceType?: string; educationLevel?: string;
  employmentStatus?: string; maritalStatus?: string; from?: string; to?: string;
}

const LABELS: Record<string, string> = {
  "18_24": "18–24", "25_34": "25–34", "35_44": "35–44", "45_54": "45–54", "55_plus": "55+",
  under_100k: "<₦100k", "100k_300k": "₦100–300k", "300k_700k": "₦300–700k",
  "700k_1_5m": "₦700k–1.5m", over_1_5m: ">₦1.5m",
  male: "Male", female: "Female", android: "Android", ios: "iOS", desktop: "Desktop",
  employed: "Employed", self_employed: "Self-employed", student: "Student",
  unemployed: "Unemployed", retired: "Retired", single: "Single", married: "Married",
  other: "Other", primary: "Primary", secondary: "Secondary", bachelors: "Bachelor's",
  masters: "Master's", phd: "PhD",
};
const lbl = (k: string) => LABELS[k] ?? k;

function Card({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{
      background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
      borderRadius: 16, padding: 20, gridColumn: wide ? "1 / -1" : "auto",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "2px 0 0" }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "16px 18px" }}>
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, margin: "4px 0 0", letterSpacing: "-0.02em" }}>{value}</p>
      {hint && <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: "2px 0 0" }}>{hint}</p>}
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))",
  borderRadius: 10, fontSize: 12, color: "hsl(var(--popover-foreground))",
};

function Select({ label, value, onChange, options }: {
  label: string; value: string | undefined; onChange: (v: string) => void; options: Array<{ v: string; l: string }>;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
      {label}
      <select
        value={value ?? "all"}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 13, padding: "7px 10px", borderRadius: 9, border: "1px solid hsl(var(--border))",
          background: "hsl(var(--background))", color: "hsl(var(--foreground))", minWidth: 130,
        }}
      >
        <option value="all">All</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

export function BrandAnalytics() {
  const [filters, setFilters] = useState<Filters>({});
  const set = (k: keyof Filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v === "all" ? undefined : v }));

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [filters]);

  const { data: filterOpts } = useQuery<{ ads: Array<{ id: string; title: string }>; state: string[]; city: string[] }>({
    queryKey: ["analytics-filters"], queryFn: () => apiGet("/brands/analytics/filters"),
  });
  const { data, isLoading } = useQuery<DeepData>({
    queryKey: ["analytics-deep", qs], queryFn: () => apiGet(`/brands/analytics/deep${qs ? `?${qs}` : ""}`),
  });

  const [live, setLive] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLive(true), 100); return () => clearTimeout(t); }, []);

  const enums = {
    gender: ["male", "female"], ageBand: ["18_24", "25_34", "35_44", "45_54", "55_plus"],
    incomeBand: ["under_100k", "100k_300k", "300k_700k", "700k_1_5m", "over_1_5m"],
    deviceType: ["android", "ios", "desktop"],
    educationLevel: ["primary", "secondary", "bachelors", "masters", "phd", "other"],
    employmentStatus: ["employed", "self_employed", "student", "unemployed", "retired"],
    maritalStatus: ["single", "married", "other"],
  };

  return (
    <div style={{ fontFamily: "'Inter Variable', -apple-system, system-ui, sans-serif" }}>
      {/* Filter bar */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12, padding: 16, marginBottom: 20,
        background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14,
      }}>
        <Select label="Campaign" value={filters.adId} onChange={set("adId")}
          options={(filterOpts?.ads ?? []).map((a) => ({ v: a.id, l: a.title }))} />
        <Select label="Gender" value={filters.gender} onChange={set("gender")} options={enums.gender.map((v) => ({ v, l: lbl(v) }))} />
        <Select label="Age" value={filters.ageBand} onChange={set("ageBand")} options={enums.ageBand.map((v) => ({ v, l: lbl(v) }))} />
        <Select label="Income" value={filters.incomeBand} onChange={set("incomeBand")} options={enums.incomeBand.map((v) => ({ v, l: lbl(v) }))} />
        <Select label="Device" value={filters.deviceType} onChange={set("deviceType")} options={enums.deviceType.map((v) => ({ v, l: lbl(v) }))} />
        <Select label="Education" value={filters.educationLevel} onChange={set("educationLevel")} options={enums.educationLevel.map((v) => ({ v, l: lbl(v) }))} />
        <Select label="Employment" value={filters.employmentStatus} onChange={set("employmentStatus")} options={enums.employmentStatus.map((v) => ({ v, l: lbl(v) }))} />
        <Select label="Marital" value={filters.maritalStatus} onChange={set("maritalStatus")} options={enums.maritalStatus.map((v) => ({ v, l: lbl(v) }))} />
        <Select label="State" value={filters.state} onChange={set("state")} options={(filterOpts?.state ?? []).map((v) => ({ v, l: v }))} />
        <Select label="City" value={filters.city} onChange={set("city")} options={(filterOpts?.city ?? []).map((v) => ({ v, l: v }))} />
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({})} style={{
            alignSelf: "flex-end", fontSize: 12, padding: "7px 14px", borderRadius: 9,
            border: "1px solid hsl(var(--border))", background: "hsl(var(--background))", cursor: "pointer",
          }}>Clear filters</button>
        )}
      </div>

      {isLoading ? (
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: 14 }}>Loading analytics…</p>
      ) : !data || data.totals.completions === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(var(--muted-foreground))" }}>
          <p style={{ fontSize: 15, fontWeight: 600 }}>No completed reviews match these filters</p>
          <p style={{ fontSize: 13 }}>Loosen the filters, or wait for reviewers to complete your campaigns.</p>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <Stat label="Completions" value={data.totals.completions.toLocaleString()} />
            <Stat label="Unique reviewers" value={data.totals.uniqueReviewers.toLocaleString()} />
            <Stat label="Avg watch time" value={`${data.totals.avgWatch}s`} />
            <Stat label="Avg completion" value={`${data.totals.avgWatchPct}%`} hint="of video watched" />
          </div>

          {/* Chart grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
            <Card title="Completions over time" subtitle="Daily completed reviews" wide>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.timeseries} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="completions" stroke={PRIMARY} strokeWidth={2} fill="url(#g1)" isAnimationActive={live} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Gender split" subtitle="Share of completions">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.breakdowns.gender.map((b) => ({ name: lbl(b.key), value: b.completions }))}
                    dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} isAnimationActive={live}>
                    {data.breakdowns.gender.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Age distribution">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.breakdowns.ageBand.map((b) => ({ name: lbl(b.key), value: b.completions }))} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="value" fill={CHART[1]} radius={[6, 6, 0, 0]} isAnimationActive={live} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Income bands">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={data.breakdowns.incomeBand.map((b) => ({ name: lbl(b.key), value: b.completions }))} margin={{ top: 6, right: 12, bottom: 0, left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="value" fill={CHART[2]} radius={[0, 6, 6, 0]} isAnimationActive={live} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Device mix">
              <ResponsiveContainer width="100%" height={220}>
                <RadialBarChart innerRadius="30%" outerRadius="100%" data={data.breakdowns.deviceType.map((b, i) => ({ name: lbl(b.key), value: b.completions, fill: CHART[i % CHART.length] }))} startAngle={90} endAngle={-270}>
                  <RadialBar background dataKey="value" cornerRadius={6} isAnimationActive={live} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadialBarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Top states" subtitle="By completions">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={data.breakdowns.state.slice(0, 6).map((b) => ({ name: b.key, value: b.completions }))} margin={{ top: 6, right: 12, bottom: 0, left: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="value" fill={CHART[3]} radius={[0, 6, 6, 0]} isAnimationActive={live} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Education" subtitle="Audience attainment">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.breakdowns.educationLevel.map((b) => ({ name: lbl(b.key), value: b.completions }))} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="value" fill={CHART[4]} radius={[6, 6, 0, 0]} isAnimationActive={live} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Employment & marital" subtitle="Completions by segment" wide>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.breakdowns.employmentStatus.map((b) => ({ name: lbl(b.key), value: b.completions }))} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                    <Bar dataKey="value" fill={CHART[0]} radius={[6, 6, 0, 0]} isAnimationActive={live} />
                  </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.breakdowns.maritalStatus.map((b) => ({ name: lbl(b.key), value: b.completions }))}
                      dataKey="value" nameKey="name" outerRadius={80} isAnimationActive={live}>
                      {data.breakdowns.maritalStatus.map((_: { key: string }, i: number) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "wouter";

import { API_BASE } from "../../lib/apiBase";
const API = API_BASE;
const TOKEN_KEY = "adspot_token";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem(TOKEN_KEY);
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

interface Profile {
  gender?: string; ageBand?: string; state?: string; city?: string;
  employmentStatus?: string; educationLevel?: string; incomeBand?: string;
  occupationSector?: string; deviceType?: string; maritalStatus?: string;
  interests?: string[];
  displayName?: string;
  completenessPct?: number; missingFields?: string[]; profileComplete?: boolean;
}

const OPTS: Record<string, Array<{ v: string; l: string }>> = {
  gender: [["male", "Male"], ["female", "Female"]].map(([v, l]) => ({ v, l })),
  ageBand: [["18_24", "18–24"], ["25_34", "25–34"], ["35_44", "35–44"], ["45_54", "45–54"], ["55_plus", "55+"]].map(([v, l]) => ({ v, l })),
  employmentStatus: [["employed", "Employed"], ["self_employed", "Self-employed"], ["student", "Student"], ["unemployed", "Unemployed"], ["retired", "Retired"]].map(([v, l]) => ({ v, l })),
  educationLevel: [["primary", "Primary"], ["secondary", "Secondary"], ["bachelors", "Bachelor's"], ["masters", "Master's"], ["phd", "PhD"], ["other", "Other"]].map(([v, l]) => ({ v, l })),
  incomeBand: [["under_100k", "Under ₦100k"], ["100k_300k", "₦100k–300k"], ["300k_700k", "₦300k–700k"], ["700k_1_5m", "₦700k–1.5m"], ["over_1_5m", "Over ₦1.5m"]].map(([v, l]) => ({ v, l })),
  deviceType: [["android", "Android"], ["ios", "iPhone / iOS"], ["desktop", "Desktop"]].map(([v, l]) => ({ v, l })),
  maritalStatus: [["single", "Single"], ["married", "Married"], ["other", "Other"]].map(([v, l]) => ({ v, l })),
};
const SECTORS = ["Technology", "Finance", "Healthcare", "Education", "Retail", "Agriculture", "Media", "Government", "Manufacturing", "Hospitality", "Construction", "Other"];
const INTERESTS = ["Fashion", "Sports", "Music", "Gaming", "Food", "Travel", "Tech", "Beauty", "Finance", "Fitness", "Movies", "Politics"];
const NG_STATES = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];

const FIELD_LABELS: Record<string, string> = {
  gender: "Gender", ageBand: "Age", state: "State", city: "City",
  employmentStatus: "Employment", educationLevel: "Education", incomeBand: "Income",
  occupationSector: "Occupation sector", deviceType: "Device", maritalStatus: "Marital status",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))" }}>{label}</span>
      {children}
    </label>
  );
}
const selStyle: React.CSSProperties = {
  fontSize: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))",
  background: "hsl(var(--background))", color: "hsl(var(--foreground))", width: "100%",
};

function Dropdown({ value, onChange, options, placeholder }: { value?: string; onChange: (v: string) => void; options: Array<{ v: string; l: string }>; placeholder: string }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={selStyle}>
      <option value="" disabled>{placeholder}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

export default function Profile() {
  const [p, setP] = useState<Profile>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const set = (k: keyof Profile) => (v: string) => setP((prev) => ({ ...prev, [k]: v }));

  useEffect(() => { apiFetch("/auth/profile").then(setP).catch(() => {}); }, []);

  const toggleInterest = (i: string) => setP((prev) => {
    const cur = prev.interests ?? [];
    return { ...prev, interests: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].slice(0, 12) };
  });

  const save = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch("/auth/profile", { method: "PATCH", body: JSON.stringify(p) });
      setP(updated);
      setSavedAt(Date.now());
    } catch { /* surfaced via disabled state; keep simple */ }
    setSaving(false);
  };

  const pct = p.completenessPct ?? 0;
  const complete = p.profileComplete ?? false;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 64px", fontFamily: "'Inter Variable', -apple-system, system-ui, sans-serif" }}>
      <Link href="/dashboard" style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", textDecoration: "none" }}>‹ Back to dashboard</Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 4px" }}>Your profile</h1>
      <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", margin: 0 }}>
        A complete profile is required to appear on the leaderboard and win rewards — and it powers the audience insights brands rely on.
      </p>

      {/* Completeness meter */}
      <div style={{ margin: "20px 0 28px", padding: 16, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{complete ? "Profile complete — you're leaderboard-eligible" : "Profile completeness"}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: complete ? "hsl(142 70% 40%)" : "hsl(25 95% 53%)" }}>{pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "hsl(var(--muted))", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: complete ? "hsl(142 70% 45%)" : "hsl(25 95% 53%)", transition: "width .4s ease" }} />
        </div>
        {!complete && p.missingFields && p.missingFields.length > 0 && (
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "10px 0 0" }}>
            Still needed: {p.missingFields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}
          </p>
        )}
      </div>

      {/* Grid of fields */}
      <Field label="Leaderboard display name">
        <input
          value={p.displayName ?? ""}
          onChange={(e) => setP((prev) => ({ ...prev, displayName: e.target.value }))}
          placeholder="Shown on leaderboard (not your brand name)"
          maxLength={40}
          style={selStyle}
          data-testid="earn-display-name"
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
        <Field label="Gender"><Dropdown value={p.gender} onChange={set("gender")} options={OPTS.gender} placeholder="Select…" /></Field>
        <Field label="Age band"><Dropdown value={p.ageBand} onChange={set("ageBand")} options={OPTS.ageBand} placeholder="Select…" /></Field>
        <Field label="State"><Dropdown value={p.state} onChange={set("state")} options={NG_STATES.map((s) => ({ v: s, l: s }))} placeholder="Select state…" /></Field>
        <Field label="City / town"><input value={p.city ?? ""} onChange={(e) => set("city")(e.target.value)} placeholder="e.g. Ikeja" style={selStyle} /></Field>
        <Field label="Employment"><Dropdown value={p.employmentStatus} onChange={set("employmentStatus")} options={OPTS.employmentStatus} placeholder="Select…" /></Field>
        <Field label="Occupation sector"><Dropdown value={p.occupationSector} onChange={set("occupationSector")} options={SECTORS.map((s) => ({ v: s, l: s }))} placeholder="Select…" /></Field>
        <Field label="Education"><Dropdown value={p.educationLevel} onChange={set("educationLevel")} options={OPTS.educationLevel} placeholder="Select…" /></Field>
        <Field label="Monthly income"><Dropdown value={p.incomeBand} onChange={set("incomeBand")} options={OPTS.incomeBand} placeholder="Select…" /></Field>
        <Field label="Primary device"><Dropdown value={p.deviceType} onChange={set("deviceType")} options={OPTS.deviceType} placeholder="Select…" /></Field>
        <Field label="Marital status"><Dropdown value={p.maritalStatus} onChange={set("maritalStatus")} options={OPTS.maritalStatus} placeholder="Select…" /></Field>
      </div>

      {/* Interests (bonus) */}
      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 10px" }}>Interests <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 400 }}>(optional — helps brands match you)</span></p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {INTERESTS.map((i) => {
            const on = (p.interests ?? []).includes(i);
            return (
              <button key={i} onClick={() => toggleInterest(i)} style={{
                fontSize: 13, padding: "7px 14px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${on ? "hsl(25 95% 53%)" : "hsl(var(--border))"}`,
                background: on ? "hsl(25 95% 53%)" : "hsl(var(--background))",
                color: on ? "white" : "hsl(var(--foreground))", fontWeight: on ? 600 : 400, transition: "all .15s",
              }}>{i}</button>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28 }}>
        <button onClick={save} disabled={saving} style={{
          fontSize: 15, fontWeight: 600, padding: "12px 28px", borderRadius: 12, cursor: saving ? "default" : "pointer",
          border: "none", background: "hsl(25 95% 53%)", color: "white", opacity: saving ? 0.7 : 1,
        }}>{saving ? "Saving…" : "Save profile"}</button>
        {savedAt && <span style={{ fontSize: 13, color: "hsl(142 70% 40%)" }}>Saved ✓</span>}
      </div>
    </div>
  );
}

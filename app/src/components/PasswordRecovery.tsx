import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "@workspace/api-client-react";
import { publicError } from "../lib/publicMessage";

const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,15,20,.55)",
  display: "grid",
  placeItems: "center",
  zIndex: 9999,
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  width: "min(92vw,380px)",
  fontFamily: "system-ui,sans-serif",
  color: "#0f0f14",
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};
const inp: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  fontSize: 14,
  marginTop: 6,
};
const btn: React.CSSProperties = {
  width: "100%",
  marginTop: 14,
  padding: 11,
  borderRadius: 8,
  border: "none",
  background: "#1d4ed8",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

export function PasswordRecovery({ brand = "AdSpot" }: { brand?: string }) {
  const [mode, setMode] = useState<"forgot" | "reset" | null>(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<Date | null>(null);

  useEffect(() => {
    const open = () => {
      if (location.hash.replace(/^#/, "") === "forgot") setMode("forgot");
    };
    open();
    window.addEventListener("hashchange", open);
    if (!supabase) return () => window.removeEventListener("hashchange", open);
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => {
      window.removeEventListener("hashchange", open);
      sub?.subscription?.unsubscribe();
    };
  }, []);

  if (!mode) return null;
  const close = () => {
    setMode(null);
    setMsg(null);
    setErr(null);
    setSentAt(null);
    if (location.hash.includes("forgot")) location.hash = "";
  };

  const sendReset = async () => {
    setBusy(true);
    setErr(null);
    if (!hasSupabase || !supabase) {
      setBusy(false);
      setErr("Password reset is temporarily unavailable. Please try again shortly.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${location.pathname}#recovery`,
    });
    setBusy(false);
    if (error) {
      setErr(publicError(error, "We couldn't send the reset link. Please try again."));
      return;
    }
    setSentAt(new Date());
    setMsg("If an account exists for that email, we've sent a reset link. Check your inbox and spam folder.");
  };

  const doReset = async () => {
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords don't match.");
    if (!supabase) {
      return setErr("Password reset is temporarily unavailable. Please try again shortly.");
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setErr(publicError(error, "We couldn't update your password. Please try again."));
      return;
    }
    setMsg("Password updated. You can sign in with it now.");
    setTimeout(close, 1800);
  };

  return (
    <div style={wrap} onClick={(e) => e.target === e.currentTarget && close()}>
      <div style={card}>
        <h3 style={{ margin: "0 0 6px" }}>{mode === "reset" ? "Set a new password" : `Reset ${brand} password`}</h3>
        {mode === "forgot" ? (
          msg ? (
            <>
              <p style={{ fontSize: 13 }}>{msg}</p>
              {sentAt && (
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Sent {sentAt.toLocaleTimeString()}
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "#374151" }}>
                Enter the email address on your account and we'll send you a link to set a new password.
              </p>
              <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              {err && <p style={{ fontSize: 13, color: "#b00020", marginTop: 8 }}>{err}</p>}
              <button style={btn} disabled={busy || !email.includes("@")} onClick={sendReset}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </>
          )
        ) : (
          <>
            <input style={inp} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (min 8)" />
            <input style={inp} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm password" />
            {(err || msg) && <p style={{ fontSize: 13, marginTop: 8 }}>{err || msg}</p>}
            <button style={btn} disabled={busy} onClick={doReset}>
              {busy ? "Saving…" : "Update password"}
            </button>
          </>
        )}
        <button type="button" onClick={close} style={{ marginTop: 10, background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
          Close
        </button>
      </div>
    </div>
  );
}

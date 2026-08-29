/** Client-side act-as mode for admin / super_admin dual identity. */
export type ActAsMode = "admin" | "brand" | "reviewer";

const KEY = "adspot_act_as";

export function getActAs(): ActAsMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "brand" || v === "reviewer" || v === "admin") return v;
  } catch {
    /* ignore */
  }
  return "admin";
}

export function setActAs(mode: ActAsMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("adspot-act-as", { detail: mode }));
}

export function canActAs(role: string | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}

/** Effective portal for routing/UI when elevated users switch context. */
export function effectivePortal(role: string | undefined | null): ActAsMode {
  if (!canActAs(role)) {
    if (role === "brand") return "brand";
    if (role === "reviewer") return "reviewer";
    return "admin";
  }
  return getActAs();
}

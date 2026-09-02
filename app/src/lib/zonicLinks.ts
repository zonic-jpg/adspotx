/** Cross-app links in the ZonicMe ecosystem (footer). */

export const ZONIC_APPS = [
  { id: "myyangax", label: "MyYangaX", href: "https://myyangax.netlify.app" },
  { id: "myafriartx", label: "MyAfriArt", href: "https://myafriartx.netlify.app" },
  { id: "rubba", label: "Rubba", href: "https://rubba.netlify.app" },
  { id: "adspotx", label: "AdSpot", href: "https://adspotx.netlify.app" },
  { id: "owanbex", label: "Owanbe", href: "https://owanbex.netlify.app" },
  { id: "zonicme", label: "ZonicMe", href: "https://zonicme.netlify.app" },
] as const;

export function siblingZonicApps(currentId: string) {
  const cur = String(currentId || "").toLowerCase();
  return ZONIC_APPS.filter((a) => a.id !== cur);
}

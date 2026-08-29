/** Which localStorage token key serves a given path.
 *  /brands/* uses the brand session; landing and /earn/* use the reviewer session.
 *  Pure so the routing rule itself is unit-testable. */
export function resolveTokenKey(pathname: string): "adspot_brand_token" | "adspot_token" {
  return pathname.startsWith("/brands") ? "adspot_brand_token" : "adspot_token";
}

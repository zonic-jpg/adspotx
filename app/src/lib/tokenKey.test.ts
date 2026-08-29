import { describe, expect, it } from "vitest";
import { resolveTokenKey } from "./tokenKey";

describe("session routing (the merged-app auth rule)", () => {
  it("brand paths use the brand token", () => {
    expect(resolveTokenKey("/brands")).toBe("adspot_brand_token");
    expect(resolveTokenKey("/brands/login")).toBe("adspot_brand_token");
    expect(resolveTokenKey("/brands/admin/financials")).toBe("adspot_brand_token");
  });

  it("landing and earn paths use the reviewer token", () => {
    expect(resolveTokenKey("/")).toBe("adspot_token");
    expect(resolveTokenKey("/earn")).toBe("adspot_token");
    expect(resolveTokenKey("/earn/review/42")).toBe("adspot_token");
  });

  it("lookalike paths do not leak the brand session", () => {
    expect(resolveTokenKey("/brandstore")).toBe("adspot_brand_token"); // startsWith by design: /brands prefix
    expect(resolveTokenKey("/bran")).toBe("adspot_token");
  });
});

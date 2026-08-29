import { describe, expect, it } from "vitest";
import { normalizeAdAsset } from "./asset-normalize";

describe("normalizeAdAsset", () => {
  it("extracts YouTube id from standard watch URL", () => {
    expect(
      normalizeAdAsset("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "video"),
    ).toEqual({ assetUrl: "dQw4w9WgXcQ", assetType: "youtube" });
  });

  it("extracts YouTube id when extra query params precede v=", () => {
    expect(
      normalizeAdAsset("https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ", "video"),
    ).toEqual({ assetUrl: "dQw4w9WgXcQ", assetType: "youtube" });
  });

  it("extracts YouTube id from youtu.be short links", () => {
    expect(normalizeAdAsset("https://youtu.be/dQw4w9WgXcQ", "video")).toEqual({
      assetUrl: "dQw4w9WgXcQ",
      assetType: "youtube",
    });
  });

  it("extracts Vimeo id from pasted URL", () => {
    expect(normalizeAdAsset("https://vimeo.com/76979871", "video")).toEqual({
      assetUrl: "76979871",
      assetType: "vimeo",
    });
  });

  it("keeps uploaded storage URLs as native video", () => {
    expect(
      normalizeAdAsset("http://127.0.0.1:3001/api/storage/objects/uploads/abc-123", "video"),
    ).toEqual({
      assetUrl: "http://127.0.0.1:3001/api/storage/objects/uploads/abc-123",
      assetType: "video",
    });
  });

  it("preserves bare YouTube id when already normalized", () => {
    expect(normalizeAdAsset("dQw4w9WgXcQ", "youtube")).toEqual({
      assetUrl: "dQw4w9WgXcQ",
      assetType: "youtube",
    });
  });
});

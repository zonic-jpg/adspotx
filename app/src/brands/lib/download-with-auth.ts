import { customFetch } from "@workspace/api-client-react";

/** Download CSV/blob via Supabase router (or legacy API) with session auth. */
export async function downloadBlobWithAuth(url: string, filename: string): Promise<void> {
  const apiPath = url.includes("/api") ? url.replace(/^.*\/api/, "/api") : url;
  const data = await customFetch<string | { csv?: string; filename?: string }>(apiPath);

  let blob: Blob;
  let outName = filename;
  if (typeof data === "string") {
    blob = new Blob([data], { type: "text/csv;charset=utf-8" });
  } else if (data && typeof data === "object" && typeof data.csv === "string") {
    blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
    if (data.filename) outName = data.filename;
  } else {
    blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(objectUrl);
  document.body.removeChild(a);
}

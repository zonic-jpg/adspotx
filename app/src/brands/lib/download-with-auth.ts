const TOKEN_KEY = "adspot_brand_token";

export async function downloadBlobWithAuth(url: string, filename: string): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(objectUrl);
  document.body.removeChild(a);
}

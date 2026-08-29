const PLACEHOLDER_PATTERNS = [
  /@HOST(?::|\/)/i,
  /USER:PASSWORD@/i,
  /postgres:\/\/USER:/i,
  /localhost:5432\/test$/,
];

export function isPlaceholderDatabaseUrl(url: string | undefined): boolean {
  if (!url) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(url));
}

export function isDatabaseConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const cause = "cause" in err ? (err as { cause?: unknown }).cause : err;
  if (!cause || typeof cause !== "object") return false;
  const code = "code" in cause ? String((cause as { code?: string }).code) : "";
  return (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "57P01" ||
    code === "3D000"
  );
}

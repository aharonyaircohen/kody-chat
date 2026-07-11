export function requestOrigin(req: Request): string {
  const explicitOrigin = originFromValue(req.headers.get("origin"));
  if (explicitOrigin) return explicitOrigin;

  const forwardedHost =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const forwardedOrigin = originFromValue(`${proto}://${forwardedHost}`);
    if (forwardedOrigin) return forwardedOrigin;
  }

  return new URL(req.url).origin;
}

function originFromValue(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

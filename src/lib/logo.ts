export const LOGO_BUCKET = "sponsor-logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// Returns a cleaned https:// URL, null for empty input, or "invalid".
export function normalizeWebsite(input: string): string | null | "invalid" {
  const v = input.trim();
  if (!v) return null;
  const withScheme = /^[a-z]+:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:") return "invalid";
    return u.toString();
  } catch {
    return "invalid";
  }
}

/** A brand landing page for ad templates: https only, no credentials, no private or local hosts. */
export function cleanLandingUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|lan|home\.arpa)$/.test(h)) return null;
  return u.toString().slice(0, 300);
}

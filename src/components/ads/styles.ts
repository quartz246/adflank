// Inline style tokens for the ads components (self-contained: no global CSS needed).
export const ui = {
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans CJK JP", sans-serif',
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e3e6ee",
  panel: "#ffffff",
  bg: "#ffffff",
  stage: "#f5f6fa",
  accent: "#4f46e5",
  error: "#b91c1c",
  errorBg: "#fef2f2",
  warn: "#92400e",
  warnBg: "#fffbeb",
  ok: "#047857",
  brandGradient: "linear-gradient(135deg,#6d28d9,#db2777)",
} as const;

export const button = (primary = false) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${primary ? ui.accent : ui.line}`,
  background: primary ? ui.accent : "#fff",
  color: primary ? "#fff" : ui.ink,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: ui.font,
}) as const;

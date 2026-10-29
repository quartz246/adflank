// RFC 4180 CSV writer for the bulk-upload exports (Meta Ads Manager import, Google Ads Editor).

/**
 * One cell. Quotes when needed, and neutralises spreadsheet formulas: a cell that starts with
 * = + @ (or a tab/CR) gets a leading apostrophe so Excel/Sheets show it as text. "-" is left alone
 * because ad copy like "-20% today" is legitimate and builders already strip formula prefixes.
 */
export function csvCell(value: unknown): string {
  let s = value === undefined || value === null ? "" : String(value);
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(header.map((h) => csvCell(row[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function csvFilename(platform: string, runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "run";
  return `adflank_${platform}_${safe}.csv`;
}

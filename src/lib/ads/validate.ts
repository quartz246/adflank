import type { TemplateIssue } from "@/lib/types/attack";
import { textLength, wordCount, type LengthLimit } from "./limits";

/** Collects issues for one template. Messages are plain text (rendered escaped by React). */
export class Issues {
  readonly list: TemplateIssue[] = [];

  add(field: string, message: string, severity: TemplateIssue["severity"]): void {
    this.list.push({ field, message, severity });
  }

  error(field: string, message: string): void {
    this.add(field, message, "error");
  }

  warn(field: string, message: string): void {
    this.add(field, message, "warn");
  }

  /** Check a text field against a length limit; returns false when an issue was added. */
  length(field: string, label: string, text: string, limit: LengthLimit): boolean {
    const n = textLength(text, limit.cjkDouble);
    const unit = limit.cjkDouble ? "characters (CJK count 2)" : "characters";
    const tag = limit.verified ? "" : " [limit unverified]";
    if (limit.min !== undefined && n < limit.min) {
      this.add(field, `${label} is ${n} ${unit}; minimum ${limit.min}.${tag} Source: ${limit.source}`, limit.severity);
      return false;
    }
    if (n > limit.max) {
      this.add(field, `${label} is ${n}/${limit.max} ${unit}.${tag} Source: ${limit.source}`, limit.severity);
      return false;
    }
    return true;
  }

  count(field: string, label: string, n: number, min: number, max: number, source: string): boolean {
    if (n < min || n > max) {
      this.error(field, `${n} ${label}; the platform needs ${min} to ${max}. Source: ${source}`);
      return false;
    }
    return true;
  }

  words(field: string, label: string, text: string, max: number, source: string, verified: boolean): boolean {
    const n = wordCount(text);
    if (n > max) {
      this.error(field, `${label} has ${n}/${max} words.${verified ? "" : " [limit unverified]"} Source: ${source}`);
      return false;
    }
    return true;
  }
}

export function hasErrors(issues: readonly TemplateIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

export function errorCount(issues: readonly TemplateIssue[]): number {
  return issues.filter((i) => i.severity === "error").length;
}

/** True when `text` mentions `name` as a whole word, case-insensitively. */
export function mentions(text: string, name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

/** Lowercase, deduplicated (keeps first occurrence) list. */
export function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    const k = s.trim().toLocaleLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out;
}

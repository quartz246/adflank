import { activity, projects, type UserRow } from "@/lib/db/repo";
import { projectSummary, type ProjectSummary } from "./summary";

/**
 * Everything the "My campaigns" dashboard shows, for one owner: the agents' Qloo activity by day and 2-hour slot, a log of
 * what they did, daily counts, the rivals -> tastes -> cities flow, reach and age groups of the planned campaigns, a to-do
 * list built from the plans, and upcoming retail dates. All from the owner's own projects; nothing is invented.
 */
const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface Dashboard {
  brands: ProjectSummary[];
  days: Array<{ key: string; label: string; date: string }>;
  heat: Record<string, number[][]>; // brand id (or "all") -> 7 days x 12 slots of Qloo calls
  daily: { calls: number[]; runs: number[]; segments: number[] };
  log: Array<{ at: string; brand: string; projectId: number; text: string; kind: "done" | "running" | "failed" }>;
  todo: Array<{ text: string; href: string; done: boolean }>;
  events: Array<{ name: string; date: string; inDays: number }>;
}

function events(now: number): Dashboard["events"] {
  const y = new Date(now).getUTCFullYear();
  const list: Array<[string, string]> = [];
  for (const yr of [y, y + 1]) {
    // US Thanksgiving: fourth Thursday of November; Black Friday the day after, Cyber Monday the Monday after.
    const nov1 = new Date(Date.UTC(yr, 10, 1)).getUTCDay();
    const thanks = 1 + ((4 - nov1 + 7) % 7) + 21;
    list.push(
      ["Valentine's Day", `${yr}-02-14`], ["Mother's Day (US)", `${yr}-05-${String(1 + ((7 - new Date(Date.UTC(yr, 4, 1)).getUTCDay()) % 7) + 7).padStart(2, "0")}`],
      ["Back to school", `${yr}-08-15`], ["Halloween", `${yr}-10-31`], ["Singles Day (11.11)", `${yr}-11-11`],
      ["Black Friday", `${yr}-11-${String(thanks + 1).padStart(2, "0")}`], ["Cyber Monday", `${yr}-11-${String(thanks + 4).padStart(2, "0")}`],
      ["Christmas", `${yr}-12-25`], ["New Year", `${yr + 1}-01-01`],
    );
  }
  const today = Date.parse(dayKey(now));
  return list
    .map(([name, date]) => ({ name, date, inDays: Math.round((Date.parse(date) - today) / DAY) }))
    .filter((e) => e.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays)
    .filter((e, i, a) => a.findIndex((x) => x.name === e.name) === i)
    .slice(0, 5);
}

export function buildDashboard(user: UserRow, now = Date.now()): Dashboard {
  const brands = projects.forUser(user.id).map(projectSummary);
  const start = Date.parse(dayKey(now)) - 6 * DAY;
  const days = Array.from({ length: 7 }, (_, i) => {
    const t = start + i * DAY;
    const d = new Date(t);
    return { key: dayKey(t), label: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }), date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) };
  });
  const idx = new Map(days.map((d, i) => [d.key, i]));
  const empty = () => days.map(() => Array.from({ length: 12 }, () => 0));
  const heat: Dashboard["heat"] = { all: empty() };
  const calls = days.map(() => 0);
  for (const c of activity.calls(user.id, new Date(start).toISOString())) {
    const t = Date.parse(c.at);
    const d = idx.get(dayKey(t));
    if (d === undefined) continue;
    const slot = Math.floor(new Date(t).getUTCHours() / 2);
    heat.all[d][slot]++;
    (heat[String(c.project_id)] ??= empty())[d][slot]++;
    calls[d]++;
  }
  const runRows = activity.runs(user.id, 60);
  const runsPerDay = days.map(() => 0);
  const segments = days.map(() => 0);
  const byId = new Map(brands.map((b) => [b.id, b]));
  for (const r of runRows) {
    const d = idx.get(dayKey(Date.parse(r.started_at)));
    if (d === undefined) continue;
    runsPerDay[d]++;
    if (r.status === "done") segments[d] += byId.get(r.project_id)?.plan?.campaigns ?? 0;
  }

  const log: Dashboard["log"] = runRows.slice(0, 12).map((r) => {
    const b = byId.get(r.project_id);
    const brand = b?.brand ?? "a brand";
    const rivals = b?.rivals.length ? b.rivals.join(" and ") : "the rivals";
    const top = b?.plan?.items[0];
    const text =
      r.status === "done"
        ? `Built ${b?.plan?.campaigns ?? 0} campaigns against ${rivals}${top ? ` · strongest: ${top.taste} fans in ${top.city}` : ""}`
        : r.status === "failed"
          ? `Run stopped: ${r.error?.replace(/\.$/, "") ?? "no data"}`
          : `Profiling ${rivals}' fans on Qloo`;
    return { at: r.started_at, brand, projectId: r.project_id, text, kind: r.status === "done" ? "done" : r.status === "failed" ? "failed" : "running" };
  });

  const todo: Dashboard["todo"] = [];
  for (const b of brands) {
    if (!b.plan) continue;
    if (!b.plan.launched) todo.push({ text: `Approve ${b.plan.campaigns} campaigns for ${b.brand}`, href: `/go/${b.id}`, done: false });
    else todo.push({ text: `${b.brand}: ${b.plan.campaigns} campaigns ready (preview)`, href: `/go/${b.id}`, done: true });
  }
  todo.push({ text: "Connect Meta, TikTok and Google Ads to publish (after the hackathon)", href: "#", done: false });

  return { brands, days, heat, daily: { calls, runs: runsPerDay, segments }, log, todo: todo.slice(0, 6), events: events(now) };
}

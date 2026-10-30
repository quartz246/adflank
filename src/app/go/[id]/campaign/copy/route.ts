import { currentUser, json } from "@/lib/auth/session";
import { projects } from "@/lib/db/repo";
import { campaignCreative, loadCampaign } from "@/lib/ads/creative/campaign";
import { generateTemplates } from "@/lib/ads";
import { googleView } from "@/components/ads/view";
import { isClean } from "@/lib/ads/creative/banned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The campaign's ad copy per category, after the banned-phrase filter: waits (bounded) for the GLM copywriter, else the
 * deterministic copy (`pending` while GLM is still writing). `rev` changes with the copy; image URLs carry it so the browser
 * reloads them once.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return json({ error: "sign in" }, 401);
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? projects.owned(id, user.id) : undefined;
  if (!p) return json({ error: "not found" }, 404);
  const got = await campaignCreative(p, user, 8_000);
  if (!got) return json({ error: "run not finished" }, 409);
  const kit = await got.kit;
  // Google RSA preview per category: the same headlines/descriptions as the export, minus lines that fail the copy rules.
  const loaded = loadCampaign(p, user);
  const google: Record<string, { headlines: string[]; descriptions: string[]; path1: string; path2: string }> = {};
  for (const s of got.c.segments) {
    const pkg = loaded?.pkgs.find((x) => x.competitor.name === s.comp);
    if (!pkg) continue;
    try {
      const t = generateTemplates(pkg, loaded?.siteUrl ? { landingUrl: loaded.siteUrl } : {}).find((x) => x.platform === "google");
      if (!t) continue;
      const g = googleView(t.json);
      const ctx = { forbidNames: got.c.segments.map((x) => x.comp), grounded: [got.c.brand, s.taste.label, s.place.label] };
      const hs = g.headlines.filter((h) => isClean(h, ctx));
      const ds = g.descriptions.filter((d) => isClean(d, ctx));
      // This ad's own lines first (they carry its taste and place), then the campaign RSA lines; RSA limits 30 / 90.
      const c = got.c.copy[s.id];
      const own = [c?.headline, c?.hook?.replace(/[.]$/, "")].filter((x): x is string => !!x && [...x].length <= 30);
      const uniq = (a: string[]) => [...new Map(a.map((x) => [x.toLowerCase(), x])).values()];
      google[s.id] = {
        headlines: uniq([hs[0] ?? got.c.brand, ...own, ...hs.slice(1)]).slice(0, 3),
        descriptions: uniq([c?.sub, c?.primary].filter((x): x is string => !!x && [...x].length <= 90).concat(ds)).slice(0, 2),
        path1: g.path1,
        path2: g.path2,
      };
    } catch {
      /* no preview for this category */
    }
  }
  const res = json({
    google,
    rev: got.c.rev,
    source: got.c.source,
    // true while the GLM copywriter is still writing: the client asks again and swaps the copy in when it lands.
    pending: got.pending,
    copy: got.c.copy,
    kit: { name: kit.name, domain: kit.domain, accent: kit.accent, onAccent: kit.onAccent, icon: kit.icon ?? null, colorSource: kit.colorSource },
  });
  res.headers.set("cache-control", "private, no-store");
  return res;
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { currentUser } from "@/lib/auth/session";
import { projects } from "@/lib/db/repo";
import { campaignCreative } from "@/lib/ads/creative/campaign";
import { Creative, FONT_FILES } from "@/lib/ads/creative/render";
import { CTA_LABEL, FORMATS, isFormat, isVariant } from "@/lib/ads/creative/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let fonts: Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 900; style: "normal" }>> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    FONT_FILES.map(async (f) => {
      const b = await readFile(join(process.cwd(), "public", "ads", "fonts", f.file));
      return { name: f.name, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, weight: f.weight, style: "normal" as const };
    }),
  ).catch((e) => {
    fonts = null;
    throw e;
  });
  return fonts;
}

const bad = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/** One ad creative as PNG: ?s=segment&f=sq|pt|st&v=bold|editorial|type&c=copy-rev[&dl=1]. Owner of the project only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return bad(401);
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? projects.owned(id, user.id) : undefined;
  if (!p) return bad(404);
  const q = new URL(req.url).searchParams;
  const s = Number(q.get("s"));
  const f = q.get("f");
  const v = q.get("v");
  if (!Number.isInteger(s) || s < 0 || s > 20 || !isFormat(f) || !isVariant(v)) return bad(400);

  const got = await campaignCreative(p, user, 1500);
  if (!got) return bad(409);
  const seg = got.c.segments[s];
  if (!seg) return bad(404);
  const copy = got.c.copy[seg.id];
  const kit = await got.kit;
  const pkg = got.c.segments[s];
  const cta = CTA_LABEL.SHOP_NOW;
  const F = FORMATS[f];
  const place = /^[A-Z]{2}$/.test(pkg.place.label) ? "" : pkg.place.label;
  const stable = q.get("c") === got.c.rev && !got.pending;
  const name = `${kit.name.replace(/[^\w-]+/g, "-")}_${f}_${v}_${s + 1}.png`.toLowerCase();
  return new ImageResponse(<Creative d={{ kit, hook: copy.hook, sub: copy.sub, cta, taste: seg.taste.label, place }} fmt={f} v={v} />, {
    width: F.w,
    height: F.h,
    fonts: await loadFonts(),
    headers: {
      "cache-control": stable ? "private, max-age=86400, immutable" : "private, no-store",
      "x-copy-source": got.c.source,
      ...(q.get("dl") ? { "content-disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}

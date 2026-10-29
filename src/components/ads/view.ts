// Safe readers for PlatformTemplate.json (typed `unknown` in the contract, and it may come from the DB).

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const at = (v: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (Array.isArray(o) ? o[Number(k)] : obj(o)[k]), v);

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function ctaLabel(cta: string): string {
  const s = cta.replace(/_/g, " ").toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "Learn more";
}

export function metaView(json: unknown) {
  const link = at(json, "ad", "creative", "object_story_spec", "link_data");
  const t = at(json, "adset", "targeting");
  const geo = obj(at(t, "geo_locations"));
  return {
    primaryText: str(at(link, "message")),
    headline: str(at(link, "name")),
    description: str(at(link, "description")),
    link: str(at(link, "link")),
    cta: str(at(link, "call_to_action", "type")),
    objective: str(at(json, "campaign", "objective")),
    ageMin: str(at(t, "age_min")),
    ageMax: str(at(t, "age_max")),
    genders: arr(at(t, "genders")).map(str),
    places: [
      ...arr(geo.cities).map((c) => `${str(at(c, "name"))} +${str(at(c, "radius"))} ${str(at(c, "distance_unit")) === "mile" ? "mi" : "km"}`),
      ...arr(geo.regions).map((r) => str(at(r, "name"))),
      ...arr(geo.countries).map(str),
    ].filter(Boolean),
    interests: arr(at(t, "flexible_spec", "0", "interests")).map((i) => str(at(i, "name"))).filter(Boolean),
  };
}

export function tiktokView(json: unknown) {
  const ad = at(json, "ad");
  const g = at(json, "adgroup");
  const brief = obj(at(json, "creative_brief"));
  return {
    adText: str(at(ad, "ad_text")),
    displayName: str(at(ad, "display_name")),
    cta: str(at(ad, "call_to_action")),
    link: str(at(ad, "landing_page_url")),
    ageGroups: arr(at(g, "age_groups")).map(str),
    gender: str(at(g, "gender")),
    places: arr(at(g, "location_names")).map(str),
    interests: arr(at(g, "interest_keywords")).map(str),
    brief: {
      hook: str(brief.hook),
      scenes: arr(brief.scenes).map(str),
      onScreenText: arr(brief.onScreenText).map(str),
      sound: str(brief.sound),
      creators: arr(brief.creators).map(str),
    },
  };
}

export function googleView(json: unknown) {
  const ad = at(json, "ad_group_ad", "ad");
  const rsa = at(ad, "responsive_search_ad");
  return {
    headlines: arr(at(rsa, "headlines")).map((h) => str(at(h, "text"))),
    descriptions: arr(at(rsa, "descriptions")).map((d) => str(at(d, "text"))),
    path1: str(at(rsa, "path1")),
    path2: str(at(rsa, "path2")),
    finalUrl: str(arr(at(ad, "final_urls"))[0]),
    keywords: arr(at(json, "keywords")).map((k) => ({
      text: str(at(k, "text")),
      match: str(at(k, "match_type")),
      negative: at(k, "negative") === true,
    })),
    segment: {
      name: str(at(json, "audience_segments", "0", "name")),
      members: arr(at(json, "audience_segments", "0", "members")).map((m) => str(at(m, "keyword"))).filter(Boolean),
    },
    locations: arr(at(json, "campaign", "geo_target_locations")).map((l) => {
      const n = str(at(l, "name")), c = str(at(l, "country_code"));
      return n === c ? c : `${n}, ${c}`;
    }),
  };
}

// Synthetic attack package for tests and previews. Invented brands and numbers: NO Qloo response data.
import type { AttackPackage, QlooCitation } from "@/lib/types/attack";

const RUN = "synthetic_0001";
const at = "2026-10-29T12:00:00.000Z";

function cite(n: number, tool: QlooCitation["tool"], args: Record<string, unknown>): QlooCitation {
  return { id: `q_${RUN}_${n}`, tool, args, at, ok: true };
}

const citations: QlooCitation[] = [
  cite(1, "qloo_describe", { name: "Juniper Roasters" }),
  cite(2, "qloo_describe", { name: "Kettle & Crane Coffee" }),
  cite(3, "qloo_where_popular", { entity: "Kettle & Crane Coffee", within: "US" }),
  cite(4, "qloo_audience_demographics", { entity: "Kettle & Crane Coffee" }),
  cite(5, "qloo_entity_tags", { entity: "Kettle & Crane Coffee" }),
  cite(6, "qloo_recommend", { entity: "Kettle & Crane Coffee", type: "podcast" }),
  cite(7, "qloo_compare_audiences", { a: "Juniper Roasters", b: "Kettle & Crane Coffee" }),
  cite(8, "qloo_trends", { entities: ["Juniper Roasters", "Kettle & Crane Coffee"] }),
];

export const SYNTHETIC_PACKAGE: AttackPackage = {
  runId: RUN,
  createdAt: at,
  brand: { name: "Juniper Roasters", qlooId: "SYNTH-BRAND-1", type: "urn:entity:brand" },
  competitor: { name: "Kettle & Crane Coffee", qlooId: "SYNTH-BRAND-2", type: "urn:entity:brand" },
  locale: { countryCodes: ["US"], language: "en" },
  // Shapes follow core's composer (CONTRACT_LOG 10-29): metro + region labels, an untargetable "near" point,
  // and audience values as Qloo-style relative affinity indexes (-1..1), not population shares.
  where: [
    { city: "Austin", region: "Texas", countryCode: "US", score: 0.91, cite: "q_synthetic_0001_3" },
    { city: "Denver", region: "Colorado", countryCode: "US", score: 0.84, cite: "q_synthetic_0001_3" },
    { city: "Portland", region: "Oregon", countryCode: "US", score: 0.8, cite: "q_synthetic_0001_3" },
    { region: "near 41.20,-104.10", countryCode: "US", score: 0.42, cite: "q_synthetic_0001_3" },
  ],
  who: {
    ages: [
      { band: "18-24", share: -0.12 }, { band: "25-34", share: 0.31 }, { band: "35-44", share: 0.18 },
      { band: "45-54", share: -0.05 }, { band: "55+", share: -0.27 },
    ],
    female: 0.08,
    male: -0.06,
    cite: "q_synthetic_0001_4",
  },
  interests: [
    { name: "Specialty coffee", affinity: 0.93, cite: "q_synthetic_0001_5" },
    { name: "Trail running", affinity: 0.81, cite: "q_synthetic_0001_5" },
    { name: "Vinyl records", affinity: 0.77, cite: "q_synthetic_0001_5" },
    { name: "Plant-based baking", affinity: 0.7, cite: "q_synthetic_0001_5" },
    { name: "Indie film", affinity: 0.64, cite: "q_synthetic_0001_5" },
  ],
  creators: [
    { name: "The Slow Pour Podcast", kind: "podcast", affinity: 0.88, cite: "q_synthetic_0001_6" },
    { name: "Morning Miles Show", kind: "podcast", affinity: 0.79, cite: "q_synthetic_0001_6" },
    { name: "Static Bloom", kind: "artist", affinity: 0.72, cite: "q_synthetic_0001_6" },
  ],
  gap: [
    { label: "Trail running", theirs: 0.82, yours: 0.41, delta: 0.41, cite: "q_synthetic_0001_7" },
    { label: "Vinyl records", theirs: 0.74, yours: 0.4, delta: 0.34, cite: "q_synthetic_0001_7" },
    { label: "Oat milk", theirs: 0.69, yours: 0.45, delta: 0.24, cite: "q_synthetic_0001_7" },
  ],
  trends: [
    { entity: "Juniper Roasters", direction: "rising", changePct: 6, cite: "q_synthetic_0001_8" },
    { entity: "Kettle & Crane Coffee", direction: "flat", changePct: 0, cite: "q_synthetic_0001_8" },
  ],
  copyAngles: [
    "Fuel for your trail running mornings, roasted fresh every week.",
    "Spin a record, pour a slow cup: coffee for vinyl records lovers.",
    "Oat milk that tastes like it belongs in your cup.",
  ],
  citations: Object.fromEntries(citations.map((c) => [c.id, c])),
};

/** A Japanese-market variant: CJK text exercises the double-width counting. */
export const SYNTHETIC_PACKAGE_JA: AttackPackage = {
  ...SYNTHETIC_PACKAGE,
  runId: "synthetic_ja_0001",
  brand: { name: "ジュニパー珈琲" },
  competitor: { name: "ケトル珈琲店" },
  locale: { countryCodes: ["JP"], language: "ja" },
  where: [{ city: "渋谷", countryCode: "JP", score: 0.9, cite: "q_synthetic_0001_3" }],
  interests: [{ name: "スペシャルティコーヒー", affinity: 0.9, cite: "q_synthetic_0001_5" }],
  gap: [{ label: "トレイルランニング", theirs: 0.8, yours: 0.4, delta: 0.4, cite: "q_synthetic_0001_7" }],
  copyAngles: ["トレイルランニングの朝に、毎週焙煎したてのコーヒーを。"],
};

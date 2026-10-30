import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Sans, Instrument_Serif, Inter, JetBrains_Mono, Sora, Space_Grotesk } from "next/font/google";
import { DEFAULT_DESIGN } from "@/lib/designs";
import "./globals.css";
import "@/components/wizard/designs.css";
import "@/components/wizard/mobile.css";

export const metadata: Metadata = {
  title: "Poachly: an ad agency that works non-stop to win your competitors' customers",
  description: "Paste your website. Poachly's agents profile your competitors' fans on Qloo's taste graph, design a campaign for every segment and keep fighting for those customers every day.",
};

// viewport-fit=cover so env(safe-area-inset-*) is real on notched phones (mobile.css pads for it).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b0d0e" };

const inter = Inter({ subsets: ["latin"], variable: "--f-inter", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--f-serif", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--f-grotesk", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--f-sora", display: "swap" });
const dm = DM_Sans({ subsets: ["latin"], variable: "--f-dm", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-plex", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // One look for everyone; an old adflank_design cookie from the retired design switcher no longer applies.
  const design = DEFAULT_DESIGN;
  return (
    <html lang="en" data-design={design} className={[inter, serif, grotesk, mono, sora, plex, dm].map((f) => f.variable).join(" ")}>
      <body>
        {children}
      </body>
    </html>
  );
}

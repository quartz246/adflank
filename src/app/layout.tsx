import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdFlank: win your competitors' customers with Qloo taste data",
  description: "An agent team that watches your competitors every day with Qloo and turns their audience's taste into ready-to-publish Meta, TikTok and Google Ads templates.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

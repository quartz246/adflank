import ConnectConsent from "@/components/ads/ConnectConsent";
import { PLATFORM_LABEL, PLATFORMS, isPlatform } from "@/lib/ads/platforms";

/** Only same-site project paths are accepted as the "back" target (no open redirect). */
function safeBack(from: string | string[] | undefined): string {
  const f = typeof from === "string" ? from : "";
  return /^\/projects\/[A-Za-z0-9_-]{1,64}(\/ads)?$/.test(f) ? f : "/projects";
}

export default async function ConnectPage({ params, searchParams }: {
  params: Promise<{ platform: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { platform } = await params;
  const { from } = await searchParams;
  if (!isPlatform(platform)) {
    return (
      <div className="empty" style={{ maxWidth: 520, margin: "40px auto" }}>
        <div className="icon" aria-hidden>?</div>
        <h1 style={{ fontSize: 20 }}>Unknown ad platform</h1>
        <p>Choose one of: {PLATFORMS.map((p) => PLATFORM_LABEL[p]).join(", ")}.</p>
        <p><a className="btn secondary" href="/projects">Back to projects</a></p>
      </div>
    );
  }
  return <ConnectConsent platform={platform} backHref={safeBack(from)} />;
}

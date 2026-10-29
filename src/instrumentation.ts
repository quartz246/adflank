/** Next.js server start hook: start the daily scheduler (60 s tick, one run at a time). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/agent/scheduler");
    startScheduler();
    // Seed the judge/demo project (first boot only); a failure here must never stop the server.
    if (process.env.DEMO !== "0" && process.env.NEXT_PHASE !== "phase-production-build") {
      const { ensureDemo } = await import("./lib/demo");
      setTimeout(() => void ensureDemo().catch(() => undefined), 3000).unref?.();
    }
  }
}

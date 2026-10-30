"use client";

import { useEffect, useState } from "react";
import type { CopyResponse } from "@/components/ads/AdWall";

const POLL_MS = 5_000;
const MAX_POLLS = 30;

/**
 * Loads the campaign copy + brand kit. The endpoint answers within a few seconds with the deterministic copy while the
 * GLM copywriter is still writing (`pending`); the hook asks again until GLM's copy lands or the job ends, then stops.
 */
export function useCampaignCopy(projectId: number): CopyResponse | null {
  const [data, setData] = useState<CopyResponse | null>(null);
  useEffect(() => {
    if (!Number.isInteger(projectId) || projectId <= 0) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ctl = new AbortController();
    const load = (n: number) => {
      fetch(`/go/${projectId}/campaign/copy`, { credentials: "same-origin", cache: "no-store", signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: CopyResponse | null) => {
          if (!live || !j) return;
          setData((cur) => (cur && cur.rev === j.rev ? cur : j));
          if (j.pending && n < MAX_POLLS) timer = setTimeout(() => load(n + 1), POLL_MS);
        })
        .catch(() => undefined);
    };
    load(0);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      ctl.abort();
    };
  }, [projectId]);
  return data;
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { US_PATH, WORLD_PATH } from "@/lib/geo/outlines";
import { inLower48, projectUS, projectWorld, US_VIEW } from "@/lib/geo/project";

/**
 * The campaign screen's backdrop: every campaign's city as a numbered pin over the rivals' Qloo heat zones. The map
 * fills the stage, framed into the part left of the floating ad card (measured: the stage's `.ag-adbox`), so the card
 * never hides a pin. On phones the card sits below the map and the map uses the full width.
 * Focusing a pin glides the view to it; sizes are in screen pixels, so pins and labels stay the same size at any zoom.
 */
export interface Pin { key: string; label: string; lat: number; lon: number; campaigns: number[] }
type VB = [number, number, number, number];

const ease = (t: number) => 1 - (1 - t) ** 3;

export default function CampaignMap({ pins, heat, sel, focused, onPick }: {
  pins: Pin[];
  heat: Array<{ lat: number; lon: number }>;
  sel: number;
  focused: boolean;
  onPick: (pin: Pin) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number, number]>([0, 0, 1]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const card = el.parentElement?.querySelector<HTMLElement>(".ag-adbox");
      const beside = card && getComputedStyle(card).position === "absolute";
      const clear = beside && el.clientWidth ? Math.max(0.35, (el.clientWidth - card.offsetWidth - 24) / el.clientWidth) : 1;
      setSize([el.clientWidth, el.clientHeight, clear]);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = [...pins, ...heat];
  const us = all.length === 0 || all.every((p) => inLower48(p.lat, p.lon));
  const proj = us ? projectUS : projectWorld;
  const [W, H, frac] = size;

  // The area to show: the whole lower 48, or (abroad) the bounding box of pins and heat cells.
  let base: VB = [0, 0, US_VIEW.w, US_VIEW.h];
  if (!us) {
    const xy = all.map((p) => proj(p.lat, p.lon));
    const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
    const w = Math.max(60, Math.max(...xs) - Math.min(...xs)) * 1.3, h = Math.max(40, Math.max(...ys) - Math.min(...ys)) * 1.3;
    base = [(Math.min(...xs) + Math.max(...xs)) / 2 - w / 2, (Math.min(...ys) + Math.max(...ys)) / 2 - h / 2, w, h];
  }
  // Fit an area into the clear part of the stage (box aspect), with the area's centre in the middle of that part.
  const fit = (a: VB): VB => {
    if (!W || !H) return a;
    // Room around the area for the city names (drawn right of each pin) and the label chip at the top.
    const full = frac === 1; // phones: the whole box is map, with less room per label
    const k = Math.max(a[2] / (W * frac), a[3] / H) * (full ? 1.34 : 1.16);
    const vw = W * k, vh = H * k;
    return [a[0] + a[2] / 2 - (vw * frac) / 2 + vw * frac * (full ? 0.07 : 0.04), a[1] + a[3] / 2 - vh / 2 - vh * (full ? 0.08 : 0.04), vw, vh];
  };
  const selPin = pins.find((p) => p.campaigns.includes(sel));
  let target = fit(base);
  if (focused && selPin) {
    const [px, py] = proj(selPin.lat, selPin.lon);
    const zw = base[2] / 2.6, zh = base[3] / 2.6;
    target = fit([px - zw / 2, py - zh / 2, zw, zh]);
  }

  // Glide from the current view to the target.
  const [vb, setVb] = useState<VB>(target);
  const cur = useRef<VB>(vb);
  const key = target.map((n) => n.toFixed(1)).join(",");
  useEffect(() => {
    const from = cur.current;
    const to = key.split(",").map(Number) as VB;
    if (!from[2] || !W) {
      cur.current = to;
      setVb(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 650);
      const e = ease(t);
      const v = from.map((f, i) => f + (to[i] - f) * e) as VB;
      cur.current = v;
      setVb(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, W]);

  const px = W ? vb[2] / W : 1; // map units per screen pixel
  return (
    <div className="cm" ref={box}>
      {W > 0 && (
        <svg viewBox={vb.join(" ")} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of the campaigns' cities">
          <path d={us ? US_PATH : WORLD_PATH} className="land" strokeWidth={px} />
          {heat.map((h, i) => {
            const [x, y] = proj(h.lat, h.lon);
            return <circle key={`h${i}`} cx={x} cy={y} r={px * 16} className="heat" />;
          })}
          {pins.map((p) => {
            const [x, y] = proj(p.lat, p.lon);
            const on = p.campaigns.includes(sel);
            const label = p.campaigns.map((n) => n + 1).join("·");
            const r = px * (label.length > 1 ? 15 : 13);
            return (
              <g key={p.key} className={`pin${on ? " on" : ""}`} onClick={() => onPick(p)} role="button" aria-label={`Campaign ${label} in ${p.label}`}>
                <circle cx={x} cy={y} r={px * 26} className="tap" />
                {on && <circle cx={x} cy={y} r={r} className="pulse" />}
                <circle cx={x} cy={y} r={r} className="dot" strokeWidth={px * 2} />
                <text x={x} y={y + px * 4.2} fontSize={px * 12} textAnchor="middle" className="num">{label}</text>
                <text x={x + r + px * 6} y={y + px * 4.5} fontSize={px * 13} className="nm" strokeWidth={px * 4}>{p.label}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { formatChips } from "@/lib/chips";
import type { TimelinePoint } from "@/lib/stats/history";

/**
 * Categorical series colours, in fixed order (never cycled). The reference palette's dark steps,
 * validated against the felt surface (#061f13): every adjacent pair clears the CVD and
 * normal-vision floors and every mark is ≥ 3:1 on the felt. A 9th+ player is drawn as "Other" grey.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const OTHER = "#8a8f88";
export const seriesColor = (i: number) => SERIES[i] ?? OTHER;

const SURFACE = "#061f13";
const W = 340;
const H = 170;
const PAD = { top: 10, right: 52, bottom: 20, left: 38 };

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Round tick values covering [lo, hi]. */
function ticks(lo: number, hi: number, count = 4): number[] {
  const span = Math.max(1, hi - lo);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  const top = Math.ceil(hi / step) * step;
  for (let v = Math.floor(lo / step) * step; v <= top + step / 1000; v += step) out.push(v);
  return out;
}

/** Compact ("1.5K") only when the ticks are far enough apart to stay distinct. */
function tickLabel(v: number, step: number): string {
  return step >= 100 ? compact.format(v) : v.toLocaleString("en-US");
}

interface StackChartProps {
  timeline: TimelinePoint[];
  /** Players in legend order; index = colour slot. */
  uids: string[];
  nameOf: (uid: string) => string;
}

/** Everyone's stack after each hand of a session. Hover or touch for the numbers. */
export function StackChart({ timeline, uids, nameOf }: StackChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  if (timeline.length < 2) return null;

  const values = timeline.flatMap((p) => Object.values(p.stacks));
  const yt = ticks(Math.min(...values), Math.max(...values));
  const [y0, y1] = [yt[0], yt.at(-1)!];
  const x = (i: number) => PAD.left + (i / (timeline.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - y0) / Math.max(1, y1 - y0)) * (H - PAD.top - PAD.bottom);

  const series = uids.map((uid, i) => {
    const pts = timeline.flatMap((p, j) => (p.stacks[uid] === undefined ? [] : [{ j, v: p.stacks[uid] }]));
    return { uid, color: seriesColor(i), pts };
  });

  // Direct end labels only when there are few lines and they don't collide.
  const ends = series.filter((s) => s.pts.length).map((s) => ({ ...s, ey: y(s.pts.at(-1)!.v) }));
  const sorted = [...ends].sort((a, b) => a.ey - b.ey);
  const labelled = ends.length <= 4 && sorted.every((s, i) => i === 0 || s.ey - sorted[i - 1].ey >= 11);

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (timeline.length - 1));
    setHover(Math.max(0, Math.min(timeline.length - 1, i)));
  }

  const hp = hover !== null ? timeline[hover] : null;

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Stacks over ${timeline.length - 1} hands`}
        className="touch-pan-y select-none"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        {yt.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="rgb(245 239 224 / 0.1)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ivory-muted text-[9px] tabular-nums">
              {tickLabel(v, yt[1] - yt[0])}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 4} className="fill-ivory-muted text-[9px]">
          Start
        </text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-ivory-muted text-[9px] tabular-nums">
          Hand #{timeline.at(-1)!.hand}
        </text>

        {series.map((s) => (
          <polyline
            key={s.uid}
            points={s.pts.map((p) => `${x(p.j)},${y(p.v)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgb(245 239 224 / 0.35)" strokeWidth={1} />
        )}

        {series.map((s) => {
          const p = hover !== null ? s.pts.find((q) => q.j === hover) : s.pts.at(-1);
          return p ? (
            <circle key={s.uid} cx={x(p.j)} cy={y(p.v)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
          ) : null;
        })}

        {labelled &&
          ends.map((s) => (
            <text key={s.uid} x={W - PAD.right + 8} y={s.ey} dy="0.32em" className="fill-ivory text-[9px] font-semibold">
              {nameOf(s.uid).slice(0, 9)}
            </text>
          ))}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-28 rounded-lg border gold-hairline bg-felt-950/95 px-2.5 py-1.5 text-[11px] shadow-lg"
          style={hover! < timeline.length / 2 ? { right: 4 } : { left: 4 }}
        >
          <p className="mb-0.5 font-semibold text-gold-200">{hp.hand === 0 ? "Start" : `After hand #${hp.hand}`}</p>
          {series
            .filter((s) => hp.stacks[s.uid] !== undefined)
            .sort((a, b) => hp.stacks[b.uid] - hp.stacks[a.uid])
            .map((s) => (
              <p key={s.uid} className="flex items-center gap-1.5 tabular-nums text-ivory">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="flex-1">{nameOf(s.uid)}</span>
                <span>{formatChips(hp.stacks[s.uid])}</span>
              </p>
            ))}
        </div>
      )}
    </figure>
  );
}

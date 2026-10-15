import { useId } from "react";
import { getDenomination } from "@/lib/chips";

interface ChipProps {
  value: number;
  size?: number;
  className?: string;
  /** Hide the value label, e.g. for chips lower in a pile. */
  plain?: boolean;
}

// Six edge spots: circumference of r=42 is ~263.9, split into 6 dash/gap pairs.
const EDGE_DASH = "22 21.98";

export function Chip({ value, size = 48, className, plain = false }: ChipProps) {
  const d = getDenomination(value);
  const id = useId();
  const shine = `${id}-shine`;
  const labelSize = d.label.length >= 3 ? 17 : 22;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`${value} chip`}
    >
      <defs>
        <radialGradient id={shine} cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={d.base} stroke="rgb(0 0 0 / 0.45)" strokeWidth="1.5" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke={d.spot}
        strokeWidth="11"
        strokeDasharray={EDGE_DASH}
        transform="rotate(-11 50 50)"
      />
      <circle cx="50" cy="50" r="31" fill={d.base} />
      <circle cx="50" cy="50" r="31" fill="none" stroke={d.spot} strokeWidth="1.6" strokeDasharray="3 3" />
      <circle cx="50" cy="50" r="26" fill={d.inlay} stroke="rgb(0 0 0 / 0.2)" strokeWidth="1" />
      {!plain && (
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fill={d.text}
          fontSize={labelSize}
          fontWeight="800"
          fontFamily="var(--font-inter), system-ui, sans-serif"
        >
          {d.label}
        </text>
      )}
      <circle cx="50" cy="50" r="48" fill={`url(#${shine})`} />
    </svg>
  );
}

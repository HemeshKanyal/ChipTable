interface CountdownRingProps {
  remainingMs: number;
  totalMs: number;
  size?: number;
}

/** Gold ring that drains as time runs out; turns red in the last 5 seconds. */
export function CountdownRing({ remainingMs, totalMs, size = 64 }: CountdownRingProps) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, remainingMs / totalMs));
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const urgent = seconds <= 5;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="timer" aria-label={`${seconds} seconds left`}>
      <svg viewBox="0 0 64 64" width={size} height={size} className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={urgent ? "var(--color-danger)" : "var(--color-gold-400)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 120ms linear, stroke 300ms" }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums ${
          urgent ? "text-danger" : "text-gold-200"
        }`}
      >
        {seconds}
      </span>
    </div>
  );
}

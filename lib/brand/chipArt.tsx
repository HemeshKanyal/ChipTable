// The app icon: a gold-rimmed poker chip with a spade, on felt. Rendered by next/og (ImageResponse),
// so plain JSX + inline SVG only.

const FELT = "#0a2e1c";
const GOLD = "#d2a43f";
const IVORY = "#f5efe0";
const INNER = "#0e4128";

/**
 * `maskable` keeps the chip inside the safe zone (the middle 80%) and fills the whole square with
 * felt, so Android can crop it to any shape.
 */
export function chipArt(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const chip = maskable ? 0.62 : 0.94;
  const stripes = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: maskable ? FELT : "transparent",
      }}
    >
      <svg width={size * chip} height={size * chip} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="49" fill={GOLD} />
        {stripes.map((deg) => (
          <rect key={deg} x="45" y="1" width="10" height="13" rx="2" fill={IVORY} transform={`rotate(${deg} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="34" fill={INNER} stroke={IVORY} strokeWidth="2" strokeDasharray="4 4" />
        <path
          d="M50 28c-8 10-18 15-18 24a9 9 0 0 0 15 6.8L44 72h12l-3-13.2A9 9 0 0 0 68 52c0-9-10-14-18-24z"
          fill={IVORY}
        />
      </svg>
    </div>
  );
}

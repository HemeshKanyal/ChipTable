/** Full-viewport felt + vignette, fixed behind page content. */
export function FeltBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="felt absolute inset-0" />
      <div className="vignette absolute inset-0" />
    </div>
  );
}

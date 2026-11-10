// Every achievement earned: a cut gem, the one emblem Vistazo shows. Styled by each screen's
// stylesheet (.vz-gem), in the platinum color.
// The gem itself, on a 24×24 grid, for drawing inside another svg.
export function GemShape() {
  return (
    <>
      <path d="M7 4h10l4 5-9 11L3 9z" />
      <path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5" />
    </>
  );
}

export function PlatinumIcon() {
  return (
    <svg className="vz-gem" viewBox="0 0 24 24" aria-hidden="true">
      <GemShape />
    </svg>
  );
}

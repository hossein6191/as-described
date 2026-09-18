// The As Described mark and wordmark. See docs/BRAND.md.
// The mark is one evenodd path: a tilted price tag with an eyelet hole and a check
// knocked out of the body, so it stays legible on any background and in one colour.
import * as React from "react";

export const BRAND_ACCENT = "#19C6A6";

const MARK_PATH =
  "M110.77 46.62 A34.15 34.15 0 0 1 148.09 26.78L310.05 56.02 A40.18 40.18 0 0 1 338.39 76.7L449.01 284.73 A56.25 56.25 0 0 1 425.75 360.8L232.42 463.59 A56.25 56.25 0 0 1 156.36 440.34L45.74 232.3 A40.18 40.18 0 0 1 44.44 197.25ZM128.96 100.04a34.15 34.15 0 1 0 68.3 0a34.15 34.15 0 1 0 -68.3 0ZM134.95 305.51L203.25 373.81A33.14 33.14 0 0 0 249.95 373.98L388.56 237.38A33.14 33.14 0 0 0 342.03 190.17L226.86 303.67L181.83 258.63A33.14 33.14 0 0 0 134.95 305.51Z";

export function LogoMark({
  size = 28,
  className,
  color = BRAND_ACCENT,
}: {
  size?: number;
  className?: string;
  /** Fill colour. Pass "currentColor" to tint the mark from the surrounding text colour. */
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path fill={color} fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 10, lineHeight: 1 }}
    >
      <LogoMark />
      <span style={{ fontWeight: 700, letterSpacing: "-0.02em", color: "currentColor" }}>
        As Described
      </span>
    </span>
  );
}

// The As Described mark and wordmark. The brand agent replaces the SVG; the exports stay.
import * as React from "react";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#19C6A6" />
      <path
        d="M20 33l8 8 16-18"
        fill="none"
        stroke="#0B0E11"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <LogoMark />
      <span style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>As Described</span>
    </span>
  );
}

// The SVG badge GET /api/badge/[id] answers with: a grey label run and a coloured message run,
// 20 px tall, in the flat style READMEs and forum posts already show for build status.
//
// This file imports nothing, on purpose: it is checked from node with no browser and no network
// (tests/unit/badge.test.mjs). Text is measured with Verdana's advance widths at 11 px, the face
// such badges are set in, and every run is pinned to that width with textLength, so a viewer
// whose fallback font is wider or narrower still sees the text fit its box.

/** good: no broken promise on record; warn: at least one, or the stake has paid a buyer; neutral: closed, unknown, or unreadable. */
export type BadgeTone = "good" | "warn" | "neutral";

/** The grey run every badge starts with. */
export const BADGE_LABEL = "As Described";

const TONES: Record<BadgeTone, string> = {
  good: "#0f8a74", // the brand teal, darkened until white text on it reads
  warn: "#c2611f",
  neutral: "#6b7280",
};
const LABEL_FILL = "#555";

/** Verdana at 11 px, in px; anything not listed is taken as DEFAULT_WIDTH. */
const WIDTHS: Record<string, number> = {
  " ": 3.87, a: 6.74, b: 6.98, c: 6.05, d: 6.98, e: 6.55, f: 3.87, g: 6.98, h: 7.06, i: 3.0, j: 3.76,
  k: 6.55, l: 3.0, m: 10.77, n: 7.06, o: 6.71, p: 6.98, q: 6.98, r: 4.69, s: 5.73, t: 4.33, u: 7.06,
  v: 6.55, w: 9.0, x: 6.55, y: 6.55, z: 5.77,
  A: 7.52, B: 7.55, C: 7.68, D: 8.47, E: 6.95, F: 6.33, G: 8.52, H: 8.27, I: 4.6, J: 5.37, K: 7.55,
  L: 6.13, M: 9.27, N: 8.23, O: 8.66, P: 6.63, Q: 8.66, R: 7.65, S: 7.55, T: 6.65, U: 8.05, V: 7.52,
  W: 10.87, X: 7.53, Y: 6.65, Z: 7.53,
  ".": 4.0, ",": 4.0, "·": 4.0, ":": 4.8, "-": 4.69, "/": 5.0, "(": 5.5, ")": 5.5, "<": 9.0, "+": 9.0,
};
const DEFAULT_WIDTH = 7;
for (const d of "0123456789") WIDTHS[d] = 6.99;

/** Horizontal padding on each side of a run's text. */
const PAD = 6;
/** The logo's box, and the gap between it and the label text. */
const LOGO = 14;
const LOGO_GAP = 4;

/** The width `s` takes in Verdana at 11 px. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDTHS[ch] ?? DEFAULT_WIDTH;
  return Math.round(w * 10) / 10;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** One run of text with the one-pixel shadow under it, centred on `x`. */
const run = (text: string, x: number) => {
  const t = escapeXml(text);
  const len = textWidth(text);
  return (
    `<text x="${x}" y="15" fill="#010101" fill-opacity=".3" textLength="${len}" lengthAdjust="spacingAndGlyphs">${t}</text>` +
    `<text x="${x}" y="14" textLength="${len}" lengthAdjust="spacingAndGlyphs">${t}</text>`
  );
};

/**
 * The whole badge as an SVG document. `logoPath` is a 512×512 path drawn white at the left of the
 * label (the site's mark); left out, the label is text alone.
 */
export function badgeSvg(label: string, message: string, tone: BadgeTone, logoPath?: string): string {
  const logoW = logoPath ? LOGO + LOGO_GAP : 0;
  const labelW = Math.ceil(textWidth(label)) + PAD * 2 + logoW;
  const messageW = Math.ceil(textWidth(message)) + PAD * 2;
  const width = labelW + messageW;
  const title = escapeXml(`${label}: ${message}`);
  const logo = logoPath
    ? `<svg x="${PAD - 1}" y="3" width="${LOGO}" height="${LOGO}" viewBox="0 0 512 512"><path fill="#fff" fill-rule="evenodd" d="${escapeXml(logoPath)}"/></svg>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${labelW}" height="20" fill="${LABEL_FILL}"/><rect x="${labelW}" width="${messageW}" height="20" fill="${TONES[tone]}"/><rect width="${width}" height="20" fill="url(#s)"/></g>` +
    logo +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    run(label, (logoW + labelW) / 2) +
    run(message, labelW + messageW / 2) +
    `</g></svg>`
  );
}

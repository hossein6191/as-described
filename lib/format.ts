// Display helpers. Pure functions, no React.

const ATTO = 10n ** 18n;

/** "1.2 GEN" from an atto amount (string, bigint or number). Trims trailing zeros, keeps up to 4 decimals. */
export function gen(atto: string | bigint | number | null | undefined, unit = " GEN"): string {
  if (atto === null || atto === undefined || atto === "") return "0" + unit;
  let v: bigint;
  try {
    v = typeof atto === "bigint" ? atto : BigInt(String(atto).trim());
  } catch {
    return "?" + unit;
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / ATTO;
  const frac = v % ATTO;
  let out = whole.toString();
  if (frac > 0n) {
    // four decimals, rounded down, then trimmed
    const f = (frac / 10n ** 14n).toString().padStart(4, "0").replace(/0+$/, "");
    if (f) out += "." + f;
    else if (whole === 0n) out = "<0.0001";
  }
  return (neg ? "-" : "") + out + unit;
}

/** GEN → atto as a bigint. Accepts "1", "0.5", "1.25". Throws on junk. */
export function toAtto(genText: string): bigint {
  const t = genText.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) throw new Error("Enter a price like 0.5 or 1");
  const [w, f = ""] = t.split(".");
  return BigInt(w) * ATTO + BigInt((f + "0".repeat(18)).slice(0, 18));
}

/** 0x1234…abcd */
export function short(address: string | null | undefined, head = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= head + tail + 1) return address;
  return address.slice(0, head) + "…" + address.slice(-tail);
}

/** "3 min ago", "2 h ago", "4 days ago"; "just now" under a minute; "" for a blank date. */
export function ago(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, nowMs - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d} days ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "2 d 3 h left", "14 min left", "40 s left", or "closed" once the deadline passed. */
export function countdown(deadlineIso: string | null | undefined, nowMs = Date.now()): string {
  if (!deadlineIso) return "";
  const t = new Date(deadlineIso).getTime();
  if (Number.isNaN(t)) return "";
  const left = Math.floor((t - nowMs) / 1000);
  if (left <= 0) return "closed";
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (d > 0) return `${d} d ${h} h left`;
  if (h > 0) return `${h} h ${m} min left`;
  if (m > 0) return `${m} min ${s} s left`;
  return `${s} s left`;
}

/** "5 min", "1 h", "3 days" from a window in seconds. */
export function windowLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) {
    const h = Math.round(seconds / 3600);
    return `${h} h`;
  }
  const d = Math.round(seconds / 86400);
  return d === 1 ? "1 day" : `${d} days`;
}

/** "18 Sep 2026 • 11:12" (UTC-free: the viewer's clock). */
export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(t)
    .replace(",", " •");
}

/** Plain-English status labels for order rows. */
export function statusLabel(status: string, verdict?: string): string {
  switch (status) {
    case "paid":
      return "In escrow";
    case "disputed":
      return "Disputed";
    case "settled":
      return verdict === "breaks" ? "Refunded by verdict" : verdict === "keeps" ? "Seller paid by verdict" : "Unclear, settled";
    case "settled_stale":
      return "Settled by rule";
    case "released":
      return "Released to seller";
    case "missing":
      return "Section reported missing";
    case "refunded":
      return "Refunded";
    default:
      return status || "—";
  }
}

export const KIND_EMOJI: Record<string, string> = {
  recipes: "🍳",
  templates: "✉️",
  notes: "📝",
  prompts: "💬",
  guide: "🧭",
  other: "📦",
};

export const KIND_GRADIENT: Record<string, string> = {
  recipes: "linear-gradient(135deg, #1d3b34 0%, #19c6a6 100%)",
  templates: "linear-gradient(135deg, #2b2340 0%, #7c5cff 100%)",
  notes: "linear-gradient(135deg, #3a2f12 0%, #f5b301 100%)",
  prompts: "linear-gradient(135deg, #123a44 0%, #2fb7e0 100%)",
  guide: "linear-gradient(135deg, #3b1f2a 0%, #f4506a 100%)",
  other: "linear-gradient(135deg, #22272e 0%, #98a2ae 100%)",
};

export const kindEmoji = (kind: string) => KIND_EMOJI[kind] ?? KIND_EMOJI.other;
export const kindGradient = (kind: string) => KIND_GRADIENT[kind] ?? KIND_GRADIENT.other;

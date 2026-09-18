// Client helpers for the delivery API (app/api/packs/[id]/…).
// Messages the wallet signs (personal_sign) — keep byte-identical on both sides:
//   upload:   "As Described\naction: upload-pack\nlisting: L3\nmanifest: <sha256 of hashes joined by ',' >"
//   read:     "As Described\naction: read-pack\norder: O7"
// The route handlers verify these with viem's verifyMessage against the address given, then
// check the chain: the upload signer must be the listing's seller and every section must hash
// to what the seller committed; the read signer must be the order's buyer.

export type PackStatus = { uploaded: boolean };

type ApiReply = { ok: boolean; reason?: string; sections?: string[]; uploaded?: boolean };

async function call(path: string, init?: RequestInit): Promise<ApiReply> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const text = await res.text();
    let body: ApiReply | null = null;
    try {
      body = text ? (JSON.parse(text) as ApiReply) : null;
    } catch {
      body = null;
    }
    if (body && typeof body.ok === "boolean") return body;
    return { ok: false, reason: `the site answered ${res.status} without a reason` };
  } catch {
    return { ok: false, reason: "could not reach the site" };
  }
}

export async function packStatus(listingId: string): Promise<PackStatus> {
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/status`);
  return { uploaded: r.ok && r.uploaded === true };
}

/** Seller uploads the section texts after `list_pack` confirmed. `signature` is personal_sign of uploadMessage(). */
export async function uploadPack(
  listingId: string,
  sections: string[],
  address: string,
  signature: string,
): Promise<{ ok: boolean; reason?: string }> {
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sections, address, signature }),
  });
  return { ok: r.ok, reason: r.reason };
}

/** Buyer fetches the sections of an order. `signature` is personal_sign of readMessage(). */
export async function fetchPack(
  listingId: string,
  orderId: string,
  address: string,
  signature: string,
): Promise<{ ok: boolean; sections?: string[]; reason?: string }> {
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/pack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order: orderId, address, signature }),
  });
  return { ok: r.ok, sections: r.sections, reason: r.reason };
}

export const uploadMessage = (listingId: string, manifest: string) =>
  `As Described\naction: upload-pack\nlisting: ${listingId}\nmanifest: ${manifest}`;
export const readMessage = (orderId: string) =>
  `As Described\naction: read-pack\norder: ${orderId}`;

/** sha256 hex of a utf-8 string, in the browser (WebCrypto). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The manifest the upload message binds: sha256 of the hashes joined by ",". */
export async function manifestOf(hashes: string[]): Promise<string> {
  return sha256Hex(hashes.join(","));
}

/** localStorage key under which a page may cache the buyer's read-pack signature per order. */
export const readSignatureKey = (orderId: string) => `as-described.read-sig.${orderId}`;

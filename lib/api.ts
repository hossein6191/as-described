// Client helpers for the delivery API (app/api/packs/[id]/…), and the two messages the wallet
// signs (personal_sign). Both sides build the messages with the functions below, so they stay
// byte-identical: the browser from the host it is on and the register it reads, the route
// handler from its own host and the register it checked. Lines are joined by "\n", no trailing
// newline, the register in lowercase:
//
//   upload:   As Described
//             Signing proves you are the seller of this listing, so the site stores its sections. It is not a transaction and moves no GEN.
//             action: upload-pack
//             site: as-described.vercel.app
//             chain: 61999
//             register: <the register's 0x address>
//             listing: L3
//             manifest: <sha256 hex of the section hashes joined by ",">
//
//   read:     As Described
//             Signing proves you are the buyer of this order, so the site shows you its sections. It is not a transaction and moves no GEN.
//             action: read-pack
//             site: as-described.vercel.app
//             chain: 61999
//             register: <the register's 0x address>
//             order: O7
//
// The route handlers verify these with viem's verifyMessage against the address given, then
// check the chain: the upload signer must be the listing's seller and every section must hash
// to what the seller committed; the read signer must be the order's buyer, and the order must be
// for the listing in the URL. Because the site, the chain and the register are part of what was
// signed, a signature given to another copy of this site, or for the same order id on another
// register, is refused here.

import { CHAIN_ID, contractAddress, isMock, readListing } from "./chain";

/** `checked` is false when the site could not tell (the route refused or never answered), not "nothing uploaded". */
export type PackStatus = { uploaded: boolean; checked: boolean };

/**
 * `status` is the HTTP status the route answered with, or 0 when the site was never reached.
 * Callers need it to tell one refusal from another without matching words in the reason:
 * only a 401 retires a cached signature, and only a 200 is an answer about a stored pack.
 */
type ApiReply = { ok: boolean; status: number; reason?: string; sections?: string[]; uploaded?: boolean };

async function call(path: string, init?: RequestInit): Promise<ApiReply> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const text = await res.text();
    let body: Omit<ApiReply, "status"> | null = null;
    try {
      body = text ? (JSON.parse(text) as Omit<ApiReply, "status">) : null;
    } catch {
      body = null;
    }
    if (body && typeof body.ok === "boolean") return { ...body, status: res.status };
    return { ok: false, status: res.status, reason: `the site answered ${res.status} without a reason` };
  } catch {
    return { ok: false, status: 0, reason: "could not reach the site" };
  }
}

export type StorageStatus = { available: boolean; backend: "blob" | "local" | "none" | "unknown" };

/** Whether this host can store uploaded packs (the demo packs never need it). */
export async function storageStatus(): Promise<StorageStatus> {
  const r = (await call("/api/storage")) as ApiReply & { available?: boolean; backend?: StorageStatus["backend"] };
  return { available: r.ok && r.available === true, backend: r.ok && r.backend ? r.backend : "unknown" };
}

/**
 * Whether a buyer of this listing can read its pack: the seller uploaded it, or it committed
 * exactly a demo pack's hashes (whose text ships with the site and needs no upload). The route
 * only knows about stored bodies; the demo check runs here, on the listing the page has usually
 * just read (the read cache answers it without another request).
 *
 * `opts.demo` is that answer when the caller already has it. `demo: false` means "this pack is
 * not a demo pack": the listing is then never re-read, which saves one gen_call per undelivered
 * custom pack on a page that lists many.
 */
export async function packStatus(listingId: string, opts: { demo?: boolean } = {}): Promise<PackStatus> {
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/status?register=${encodeURIComponent(contractAddress())}`);
  if (r.status === 200 && r.ok && r.uploaded === true) return { uploaded: true, checked: true };
  // A 400, 500 or 503 (or no answer at all) is not "nothing uploaded"; say the site could not check.
  const checked = r.status === 200;
  if (opts.demo !== undefined) return { uploaded: opts.demo, checked: checked || opts.demo };
  try {
    const listing = (await readListing(listingId)).data;
    if (!listing) return { uploaded: false, checked };
    const { isDemoHashes } = await import("./demo-keys");
    const demo = await isDemoHashes(listing.hashes);
    return { uploaded: demo, checked: checked || demo };
  } catch {
    return { uploaded: false, checked: false };
  }
}

/** Seller uploads the section texts after `list_pack` confirmed. `signature` is personal_sign of uploadMessage(). */
export async function uploadPack(
  listingId: string,
  sections: string[],
  address: string,
  signature: string,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sections, address, signature, register: contractAddress() }),
  });
  return { ok: r.ok, status: r.status, reason: r.reason };
}

/** Buyer fetches the sections of an order. `signature` is personal_sign of readMessage(). */
export async function fetchPack(
  listingId: string,
  orderId: string,
  address: string,
  signature: string,
): Promise<{ ok: boolean; status: number; sections?: string[]; reason?: string }> {
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/pack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order: orderId, address, signature, register: contractAddress() }),
  });
  return { ok: r.ok, status: r.status, sections: r.sections, reason: r.reason };
}

// ---- the signed messages ---------------------------------------------------------

/** What a signature is bound to besides its own listing or order: the site's host and the register. */
export type SignScope = { site: string; register: string };

/** The register name the messages carry under NEXT_PUBLIC_MOCK=1 (lib/register-param.ts uses the same). */
export const MOCK_REGISTER = "mock";

/** The scope this browser signs for: the host it is on and the register it reads. */
export function browserScope(): SignScope {
  return {
    site: typeof window === "undefined" ? "" : window.location.host,
    register: isMock ? MOCK_REGISTER : contractAddress(),
  };
}

const UPLOAD_WHY =
  "Signing proves you are the seller of this listing, so the site stores its sections. It is not a transaction and moves no GEN.";
const READ_WHY =
  "Signing proves you are the buyer of this order, so the site shows you its sections. It is not a transaction and moves no GEN.";

const heading = (action: string, why: string, scope: SignScope) =>
  [
    "As Described",
    why,
    `action: ${action}`,
    `site: ${scope.site}`,
    `chain: ${CHAIN_ID}`,
    `register: ${scope.register.toLowerCase()}`,
  ].join("\n");

/** The upload message for an explicit scope (the route handler passes its own host and the checked register). */
export const uploadMessageFor = (scope: SignScope, listingId: string, manifest: string) =>
  `${heading("upload-pack", UPLOAD_WHY, scope)}\nlisting: ${listingId}\nmanifest: ${manifest}`;

/** The read message for an explicit scope. The order fixes the listing on its register; the route checks it. */
export const readMessageFor = (scope: SignScope, orderId: string) =>
  `${heading("read-pack", READ_WHY, scope)}\norder: ${orderId}`;

/** The upload message this browser signs: this host, the register in use. */
export const uploadMessage = (listingId: string, manifest: string) =>
  uploadMessageFor(browserScope(), listingId, manifest);

/** The read message this browser signs: this host, the register in use. */
export const readMessage = (orderId: string) => readMessageFor(browserScope(), orderId);

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

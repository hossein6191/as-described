// Client helpers for the delivery API (app/api/packs/[id]/…). The infra agent implements them.
// Messages the wallet signs (personal_sign) — keep byte-identical on both sides:
//   upload:   "As Described\naction: upload-pack\nlisting: L3\nmanifest: <sha256 of hashes joined by ',' >"
//   read:     "As Described\naction: read-pack\norder: O7"

export type PackStatus = { uploaded: boolean };

export async function packStatus(listingId: string): Promise<PackStatus> {
  void listingId;
  return { uploaded: false };
}

/** Seller uploads the section texts after `list_pack` confirmed. `signature` is personal_sign of uploadMessage(). */
export async function uploadPack(
  listingId: string,
  sections: string[],
  address: string,
  signature: string,
): Promise<{ ok: boolean; reason?: string }> {
  void listingId;
  void sections;
  void address;
  void signature;
  return { ok: false, reason: "not implemented (stub)" };
}

/** Buyer fetches the sections of an order. `signature` is personal_sign of readMessage(). */
export async function fetchPack(
  listingId: string,
  orderId: string,
  address: string,
  signature: string,
): Promise<{ ok: boolean; sections?: string[]; reason?: string }> {
  void listingId;
  void orderId;
  void address;
  void signature;
  return { ok: false, reason: "not implemented (stub)" };
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

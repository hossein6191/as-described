// Where uploaded packs live: Vercel Blob when the project has a bucket (pathname
// packs/<register>/<listing>.json, no random suffix, overwrite allowed), else a local file store
// under .data/packs/<register>/<listing>.json. The local store is for development: a deployed
// site's disk is read-only, so without the token storageBackend() says "none" and the upload
// route refuses custom packs (the demo packs never need a store). Whatever the backend, the body
// is the envelope from lib/crypto.ts and the blob URL never leaves this module. Server side only.
//
// Two bounds on what a bucket can become:
//  - Blob objects are written and read with access "private", so nothing is served by URL at all,
//    and a bucket with no PACK_SECRET is not a bucket this site will write to: storageBackend()
//    answers "none" instead, because the pack text is what the buyer paid for. The plaintext
//    envelope is for the local .data/ store only.
//  - Anyone may deploy a register that passes the delivery API's code check, so a register other
//    than this site's own may keep at most MAX_GUEST_PACKS packs and MAX_GUEST_BYTES bytes here,
//    and at most MAX_GUEST_REGISTERS of them may store anything at all.

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { encryptionOn, openJson, sealJson } from "./crypto";
import { siteRegister } from "./register";

export type StoredPack = {
  register: string; // lowercase 0x…, the register the listing lives on
  listing: string;
  seller: string; // lowercase
  hashes: string[];
  sections: string[];
  uploadedAt: string; // ISO
};

const LOCAL_DIR = path.join(process.cwd(), ".data", "packs");

/**
 * A bucket this site can write to. Two shapes answer yes: a read-write token, and a newer Vercel
 * Blob store, which hands the project BLOB_STORE_ID and lets the deployment authenticate with its
 * own OIDC token. The SDK picks the credential itself, so nothing else in this module changes.
 */
export const blobOn = (): boolean =>
  !!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);

/**
 * "blob" on Vercel Blob, "local" when the .data/ folder is writable, "none" otherwise (a read-only
 * host with no bucket, or a bucket with no PACK_SECRET).
 *
 * A bucket without a secret would hold every paid pack in the clear, one object per listing, and
 * the two are separate steps in the host's dashboard, so having one without the other is the
 * expected accident. This site refuses it rather than storing plaintext: the upload route then
 * answers the same 503 it answers on a host with no store at all, and only the demo packs, whose
 * text ships with the site, can be listed.
 */
let backendMemo: Promise<"blob" | "local" | "none"> | null = null;
export function storageBackend(): Promise<"blob" | "local" | "none"> {
  if (!backendMemo) {
    backendMemo = (async () => {
      if (blobOn()) return encryptionOn() ? "blob" : "none";
      try {
        await mkdir(LOCAL_DIR, { recursive: true });
        await writeFile(path.join(LOCAL_DIR, ".probe"), "ok", "utf8");
        return "local";
      } catch {
        return "none";
      }
    })();
  }
  return backendMemo;
}
export const storageAvailable = async (): Promise<boolean> => (await storageBackend()) !== "none";

// Packs are keyed by (register, listing): the same listing id exists on every register.
const keyOf = (register: string, id: string) => `${register.toLowerCase()}/${id}`;
const pathnameOf = (register: string, id: string) => `packs/${keyOf(register, id)}.json`;
const localFileOf = (register: string, id: string) => path.join(LOCAL_DIR, register.toLowerCase(), `${id}.json`);

/** Ids are contract-assigned ("L12"): anything else never reaches the disk or the blob store. */
export const isListingId = (id: string) => /^L\d{1,9}$/.test(id);
export const isOrderId = (id: string) => /^O\d{1,9}$/.test(id);
/** A register is a 0x address (or "mock" under NEXT_PUBLIC_MOCK=1). */
export const isRegister = (r: string) => /^0x[0-9a-fA-F]{40}$/.test(r) || r === "mock";

async function writeText(register: string, id: string, text: string): Promise<void> {
  if (blobOn()) {
    const { put } = await import("@vercel/blob");
    await put(pathnameOf(register, id), text, {
      // Private: the object is not served by URL at all, so a leaked store id is worth nothing.
      // The body is sealed as well (lib/crypto.ts), and the URL never leaves this module.
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60, // the minimum the store accepts; reads bypass the cache anyway
    });
    return;
  }
  await mkdir(path.dirname(localFileOf(register, id)), { recursive: true });
  await writeFile(localFileOf(register, id), text, "utf8");
}

async function readText(register: string, id: string): Promise<string | null> {
  if (blobOn()) {
    const { get } = await import("@vercel/blob");
    const res = await get(pathnameOf(register, id), { access: "private", useCache: false });
    if (!res || !res.stream) return null;
    return new Response(res.stream).text();
  }
  try {
    return await readFile(localFileOf(register, id), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function exists(register: string, id: string): Promise<boolean> {
  if (blobOn()) {
    const { head, BlobNotFoundError } = await import("@vercel/blob");
    try {
      await head(pathnameOf(register, id));
      return true;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return false;
      throw e;
    }
  }
  try {
    await stat(localFileOf(register, id));
    return true;
  } catch {
    return false;
  }
}

/** A register other than this site's own may keep at most this many packs, and this many bytes, here. */
export const MAX_GUEST_PACKS = 25;
export const MAX_GUEST_BYTES = 2 * 1024 * 1024;
/** And at most this many such registers may store anything at all in one deployment. */
export const MAX_GUEST_REGISTERS = 50;

/** What savePack throws when one of those bounds is reached; the upload route answers 503 with it. */
export const STORE_LIMIT = "this deployment stores a limited number of packs per register, and this register has reached it";

/** The site's own register (and the mock one) are the deployment's own; everything else is a guest. */
function isGuest(register: string): boolean {
  const site = siteRegister();
  if (register === "mock") return false;
  return !site || register.toLowerCase() !== site.toLowerCase();
}

/** What a register already keeps here: how many packs, how many bytes, and whether this listing is among them. */
async function usageOf(register: string, id: string): Promise<{ packs: number; bytes: number; replacing: number }> {
  if (blobOn()) {
    const { list } = await import("@vercel/blob");
    const prefix = `packs/${register.toLowerCase()}/`;
    const page = await list({ prefix, limit: 1000 });
    const mine = page.blobs.find((b) => b.pathname === pathnameOf(register, id));
    return {
      packs: page.blobs.length,
      bytes: page.blobs.reduce((n, b) => n + b.size, 0),
      replacing: mine ? mine.size : 0,
    };
  }
  const dir = path.dirname(localFileOf(register, id));
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { packs: 0, bytes: 0, replacing: 0 };
  }
  let packs = 0;
  let bytes = 0;
  let replacing = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const size = (await stat(path.join(dir, name))).size;
      packs += 1;
      bytes += size;
      if (name === `${id}.json`) replacing = size;
    } catch {
      /* a file that vanished between the listing and the stat does not count */
    }
  }
  return { packs, bytes, replacing };
}

/** How many registers other than this site's own already store something here. */
async function guestRegisters(): Promise<string[]> {
  const site = siteRegister().toLowerCase();
  const keep = (key: string) => !!key && key !== "mock" && key !== site;
  // Shape as well as name: the store folder also holds the .probe file storageBackend() writes,
  // the macOS "._" sidecar this drive writes beside it and any .DS_Store the finder leaves. None
  // of those is a register, and counting them spent the guest ceiling before a guest arrived.
  if (blobOn()) {
    const { list } = await import("@vercel/blob");
    const page = await list({ prefix: "packs/", mode: "folded", limit: 1000 });
    return page.folders
      .map((f) => f.replace(/^packs\//, "").replace(/\/$/, "").toLowerCase())
      .filter((n) => isRegister(n) && keep(n));
  }
  try {
    return (await readdir(LOCAL_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name.toLowerCase())
      .filter((n) => isRegister(n) && keep(n));
  } catch {
    return [];
  }
}

/**
 * Stores one pack, sealed. Throws STORE_LIMIT when a guest register is past one of the bounds
 * above: registers are free to deploy and Studio GEN is free, so without this one visitor could
 * fill the deployment's bucket a listing at a time. Replacing a pack the same register already
 * stored is never refused, because the listing fixes its hashes, so it can only be the same bytes.
 */
export async function savePack(pack: StoredPack): Promise<void> {
  if (!isListingId(pack.listing) || !isRegister(pack.register)) throw new Error("bad listing id or register");
  if (blobOn() && !encryptionOn()) throw new Error("this deployment has no PACK_SECRET, so it does not store packs");
  const body = sealJson(pack);
  if (isGuest(pack.register)) {
    const used = await usageOf(pack.register, pack.listing);
    const size = Buffer.byteLength(body, "utf8");
    const newPack = used.replacing === 0;
    if (newPack && used.packs >= MAX_GUEST_PACKS) throw new Error(STORE_LIMIT);
    if (used.bytes - used.replacing + size > MAX_GUEST_BYTES) throw new Error(STORE_LIMIT);
    if (newPack && used.packs === 0) {
      const others = await guestRegisters();
      if (others.length >= MAX_GUEST_REGISTERS) throw new Error(STORE_LIMIT);
    }
  }
  await writeText(pack.register, pack.listing, body);
}

/** null when nothing was uploaded for this listing on this register. Throws when the stored body cannot be opened. */
export async function loadPack(register: string, listing: string): Promise<StoredPack | null> {
  if (!isListingId(listing) || !isRegister(register)) return null;
  const text = await readText(register, listing);
  if (text === null) return null;
  return openJson<StoredPack>(text);
}

export async function hasPack(register: string, listing: string): Promise<boolean> {
  if (!isListingId(listing) || !isRegister(register)) return false;
  return exists(register, listing);
}

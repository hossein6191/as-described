// Where uploaded packs live: Vercel Blob when BLOB_READ_WRITE_TOKEN is set (pathname
// packs/<id>.json, no random suffix, overwrite allowed), else a local file store under
// .data/packs/ (dev). Whatever the backend, the body is the envelope from lib/crypto.ts and
// the blob URL never leaves this module. Server side only.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { openJson, sealJson } from "./crypto";

export type StoredPack = {
  register: string; // lowercase 0x…, the register the listing lives on
  listing: string;
  seller: string; // lowercase
  hashes: string[];
  sections: string[];
  uploadedAt: string; // ISO
};

const LOCAL_DIR = path.join(process.cwd(), ".data", "packs");

export const blobOn = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

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
      access: "public", // the body is sealed; the URL is never returned to anybody
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
    const res = await get(pathnameOf(register, id), { access: "public", useCache: false });
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

export async function savePack(pack: StoredPack): Promise<void> {
  if (!isListingId(pack.listing) || !isRegister(pack.register)) throw new Error("bad listing id or register");
  await writeText(pack.register, pack.listing, sealJson(pack));
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

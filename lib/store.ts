// Where uploaded packs live: Vercel Blob when BLOB_READ_WRITE_TOKEN is set (pathname
// packs/<id>.json, no random suffix, overwrite allowed), else a local file store under
// .data/packs/ (dev). Whatever the backend, the body is the envelope from lib/crypto.ts and
// the blob URL never leaves this module. Server side only.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { openJson, sealJson } from "./crypto";

export type StoredPack = {
  listing: string;
  seller: string; // lowercase
  hashes: string[];
  sections: string[];
  uploadedAt: string; // ISO
};

const LOCAL_DIR = path.join(process.cwd(), ".data", "packs");

export const blobOn = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

const pathnameOf = (id: string) => `packs/${id}.json`;
const localFileOf = (id: string) => path.join(LOCAL_DIR, `${id}.json`);

/** Ids are contract-assigned ("L12"): anything else never reaches the disk or the blob store. */
export const isListingId = (id: string) => /^L\d{1,9}$/.test(id);
export const isOrderId = (id: string) => /^O\d{1,9}$/.test(id);

async function writeText(id: string, text: string): Promise<void> {
  if (blobOn()) {
    const { put } = await import("@vercel/blob");
    await put(pathnameOf(id), text, {
      access: "public", // the body is sealed; the URL is never returned to anybody
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60, // the minimum the store accepts; reads bypass the cache anyway
    });
    return;
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(localFileOf(id), text, "utf8");
}

async function readText(id: string): Promise<string | null> {
  if (blobOn()) {
    const { get } = await import("@vercel/blob");
    const res = await get(pathnameOf(id), { access: "public", useCache: false });
    if (!res || !res.stream) return null;
    return new Response(res.stream).text();
  }
  try {
    return await readFile(localFileOf(id), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function exists(id: string): Promise<boolean> {
  if (blobOn()) {
    const { head, BlobNotFoundError } = await import("@vercel/blob");
    try {
      await head(pathnameOf(id));
      return true;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return false;
      throw e;
    }
  }
  try {
    await stat(localFileOf(id));
    return true;
  } catch {
    return false;
  }
}

export async function savePack(pack: StoredPack): Promise<void> {
  if (!isListingId(pack.listing)) throw new Error("bad listing id");
  await writeText(pack.listing, sealJson(pack));
}

/** null when nothing was uploaded for this listing. Throws when the stored body cannot be opened. */
export async function loadPack(listing: string): Promise<StoredPack | null> {
  if (!isListingId(listing)) return null;
  const text = await readText(listing);
  if (text === null) return null;
  return openJson<StoredPack>(text);
}

export async function hasPack(listing: string): Promise<boolean> {
  if (!isListingId(listing)) return false;
  return exists(listing);
}

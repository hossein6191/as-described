// Browser-side twin of lib/demo-store.ts: is this list of committed hashes one of the demo packs?
// A demo pack's text ships with the site, so it needs no upload and no delivery store; the shop,
// the pack page and the sell page use this to skip the status route and the upload signature.

import { DEMO_PACKS } from "./demo-packs";
import { sha256Hex } from "./api";

let keysPromise: Promise<string[]> | null = null;

/** The demo packs' hash lists, joined by ",", computed once with WebCrypto. */
export function demoKeys(): Promise<string[]> {
  if (!keysPromise) {
    keysPromise = Promise.all(DEMO_PACKS.map((p) => Promise.all(p.sections.map(sha256Hex)).then((h) => h.join(","))));
  }
  return keysPromise;
}

const keyOf = (hashes: string[]) => hashes.map((h) => h.toLowerCase()).join(",");

/** True when `hashes` are exactly a demo pack's, same order and count. */
export async function isDemoHashes(hashes: string[]): Promise<boolean> {
  if (!hashes.length) return false;
  return (await demoKeys()).includes(keyOf(hashes));
}

/** The demo pack's sections for these hashes, or null. */
export async function demoSectionsFor(hashes: string[]): Promise<string[] | null> {
  const i = (await demoKeys()).indexOf(keyOf(hashes));
  return i >= 0 ? [...DEMO_PACKS[i].sections] : null;
}

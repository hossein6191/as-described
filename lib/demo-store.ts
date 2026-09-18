// Content-addressed fallback for the demo packs (server side, node runtime).
//
// The three demo packs live in the repository, so a listing whose committed hashes are exactly
// the hashes of a demo pack's sections can be served without a storage bucket: the content is
// public in lib/demo-packs.ts anyway. Every other pack needs the store (Vercel Blob or .data/).
// Matching is by the section hashes the seller committed on chain, never by title or id, so a
// listing that committed different bytes never receives the demo text.

import { createHash } from "node:crypto";
import { DEMO_PACKS } from "./demo-packs";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

let index: Map<string, string[]> | null = null;
function build(): Map<string, string[]> {
  if (!index) {
    index = new Map();
    for (const p of DEMO_PACKS) {
      index.set(p.sections.map(sha256).join(","), p.sections);
    }
  }
  return index;
}

/** The demo pack whose sections hash exactly to `hashes` (same order, same count), or null. */
export function demoSectionsFor(hashes: string[]): string[] | null {
  if (!hashes.length) return null;
  return build().get(hashes.map((h) => h.toLowerCase()).join(",")) ?? null;
}

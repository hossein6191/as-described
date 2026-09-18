// GET /api/snapshot → data/snapshot.json, or 404 when the site ships none.
// lib/chain.ts asks for this only after a live read failed every retry; the page then labels
// what it shows as a snapshot. Read from disk at request time, so a missing file is a 404 and
// never a build failure.

import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const text = await readFile(path.join(process.cwd(), "data", "snapshot.json"), "utf8");
    JSON.parse(text); // a broken file is a 404, not a broken page
    return new Response(text, {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false, reason: "no snapshot" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
}

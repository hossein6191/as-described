// GET /api/storage → { ok, available, backend } : whether uploaded packs can be stored on this host.
// The demo packs never need storage (their text ships with the site); custom packs do.

import { storageBackend } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const backend = await storageBackend();
  return Response.json(
    { ok: true, available: backend !== "none", backend },
    { headers: { "cache-control": "no-store" } },
  );
}

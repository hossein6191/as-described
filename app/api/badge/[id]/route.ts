// GET /api/badge/[id] → an SVG badge for a README, a forum post or a shop page:
// "As Described | 3 sold · 0 broken · 1.5 GEN staked". Whoever embeds it links it to /pack/[id].
// Read like /api/listing/[id] (lib/public-listing.ts): the site's register, one answer reused for
// a minute here, and cacheable for a minute by whatever sits in front. Any failure, an unknown id
// included, is a grey badge with status 200 and a short cache, never an error: an image tag shows
// a broken icon for an error, which says nothing to the reader.

import { MARK_PATH } from "@/components/brand/logo";
import { BADGE_LABEL, badgeSvg, type BadgeTone } from "@/lib/badge";
import { callerOf } from "@/lib/budget";
import { readPublicListing } from "@/lib/public-listing";
import { badgeMessage } from "@/lib/stake-text";
import { isListingId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No stale-while-revalidate: a cache in front would otherwise hand out an answer minutes old
// once more after it expired, and a badge that just turned orange should not read clean.
const CACHE = "public, max-age=60, s-maxage=60";
const SHORT = "public, max-age=15, s-maxage=15";

const svg = (text: string, tone: BadgeTone, cache: string) =>
  new Response(badgeSvg(BADGE_LABEL, text, tone, MARK_PATH), {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": cache,
      "access-control-allow-origin": "*",
    },
  });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const read = await readPublicListing(id, callerOf(req));
    if (!read.ok) return svg(isListingId(id) ? `listing ${id}` : "not a listing", "neutral", SHORT);
    if (!read.data) return svg(`no listing ${id}`, "neutral", SHORT);
    const m = badgeMessage(read.data.listing);
    return svg(m.text, m.tone, read.stale ? SHORT : CACHE);
  } catch {
    return svg(isListingId(id) ? `listing ${id}` : "not a listing", "neutral", SHORT);
  }
}

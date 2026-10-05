// The card another website shows in an iframe: one listing's title, price and promises, the stake
// behind it, its seller's record, and a button that opens the pack page here in a new tab. Buying
// happens there because a wallet extension does not inject into another site's frame. The page
// has nothing to sign and renders with no header, footer, wallet or animated background
// (components/site-chrome.tsx); /embed/* is the only path next.config.ts lets other sites frame.
// Read on the server, like the badge and the listing JSON (lib/public-listing.ts), so a reader of
// the host page never spends their own Studio budget on it.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { callerOf } from "@/lib/budget";
import { ago, gen, kindEmoji, kindGradient, short, windowLabel } from "@/lib/format";
import { readPublicListing } from "@/lib/public-listing";
import { backingText } from "@/lib/stake-text";
import { isListingId } from "@/lib/store";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: isListingId(id) ? `Pack ${id}` : "Pack",
    description: "A pack sold with enforced promises: the price goes into escrow, and a broken promise is paid from the seller's stake.",
    robots: { index: false, follow: false },
  };
}

const frame = "flex h-dvh flex-col gap-3 overflow-hidden rounded-2xl border bg-surface p-4 text-foreground";
const link = "text-primary underline-offset-4 hover:underline";

function Brand({ note }: { note?: string }) {
  return (
    <footer className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <LogoMark size={14} /> As Described · escrow and verdicts on GenLayer
      </span>
      {note ? <span>{note}</span> : null}
    </footer>
  );
}

/** What the card shows when there is no listing to show: a reason and a way to the site. */
function Unavailable({ id, text }: { id: string; text: string }) {
  const href = isListingId(id) ? `/pack/${id}` : "/shop";
  return (
    <div className={cn(frame, "justify-between")}>
      <div className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">{isListingId(id) ? id : "As Described"}</p>
        <p className="text-sm">{text}</p>
      </div>
      <div className="space-y-3">
        <Button asChild variant="outline" className="w-full">
          <a href={href} target="_blank" rel="noopener">
            Open As Described <ExternalLink />
          </a>
        </Button>
        <Brand />
      </div>
    </div>
  );
}

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await readPublicListing(id, callerOf({ headers: await headers() }));
  if (!read.ok) return <Unavailable id={id} text={read.status === 400 ? `"${id.slice(0, 24)}" is not a listing id.` : `This listing could not be read: ${read.reason}.`} />;
  if (!read.data) return <Unavailable id={id} text={`There is no listing ${id} on this register.`} />;

  const { listing: l, seller } = read.data;
  const backing = backingText(l);
  // A buy the contract would refuse is not offered: the button then only shows the pack.
  const canBuy = l.open && (!l.stakeKnown || l.free > 0);
  const status = !l.open ? (l.closedReason === "out_of_stake" ? "Out of stake" : "Closed") : canBuy ? "" : "All slots taken";

  return (
    <div className={frame}>
      <header className="flex items-start gap-3">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl select-none"
          style={{ backgroundImage: kindGradient(l.kind) }}
          aria-hidden="true"
        >
          {kindEmoji(l.kind)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-sm leading-snug font-semibold">{l.title}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono">{l.id}</span> · {l.sectionCount} {l.sectionCount === 1 ? "section" : "sections"} · {windowLabel(l.windowSeconds)} to dispute
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold">{gen(l.priceAtto)}</p>
          {status ? <p className="text-[10px] font-medium text-gold uppercase">{status}</p> : null}
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto">
        <h2 className="mb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Promises, enforced on chain</h2>
        <ol className="space-y-1.5">
          {l.promises.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-px inline-flex h-4 shrink-0 items-center rounded-full bg-gold/15 px-1.5 font-mono text-[10px] font-semibold text-gold">
                P{i + 1}
              </span>
              <span className="break-words">{p}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-1 text-[11px] text-muted-foreground">
        {backing ? (
          <p className={cn("flex items-start gap-1.5", canBuy ? "text-foreground" : "text-gold")}>
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" /> <span>{backing}</span>
          </p>
        ) : null}
        {l.stakeKnown && canBuy ? (
          <p>If a section breaks a promise, the buyer gets the price, the bond and {gen(l.sliceAtto)} of this stake.</p>
        ) : null}
        <p>
          Seller{" "}
          <a href={`/seller/${l.seller}`} target="_blank" rel="noopener" className={cn(link, "font-mono")} title={l.seller}>
            {short(l.seller)}
          </a>
          {seller
            ? ` · sold ${seller.sold} · kept ${seller.kept} · broken ${seller.broken} · refunded ${seller.refunded}`
            : ` · ${l.orders} sold here · kept ${l.kept} · broken ${l.broken}`}
        </p>
      </div>

      <Button asChild variant={canBuy ? "cool" : "outline"} className="w-full">
        <a href={`/pack/${l.id}`} target="_blank" rel="noopener">
          {canBuy ? `Buy for ${gen(l.priceAtto)} on As Described` : "View on As Described"} <ExternalLink />
        </a>
      </Button>
      <Brand note={read.stale ? `read ${ago(new Date(read.readAt).toISOString())}` : undefined} />
    </div>
  );
}

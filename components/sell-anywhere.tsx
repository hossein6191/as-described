"use client";

// "Sell it anywhere", on a pack page: what another website pastes to show this listing, each with
// a copy button. The card (/embed/[id]), the badge (/api/badge/[id]) and the JSON (/api/listing/[id])
// read the site's own register on the server, so a browser that reads a register of its own
// (chosen on /deploy) would be handing out the site's listing of the same id, not this one: the
// box says that instead of offering the snippets. The badge preview is drawn here, from the row
// this page already read, with the function the badge route uses: viewing a pack spends none of
// the server's budget for other sites' reads.

import * as React from "react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";

import { MARK_PATH } from "@/components/brand/logo";
import { YourRegisterNotice } from "@/components/register-line";
import { Button } from "@/components/ui/button";
import { useLocal } from "@/components/use-local";
import { BADGE_LABEL, badgeSvg } from "@/lib/badge";
import { isMock, type Listing } from "@/lib/chain";
import { registerSource } from "@/lib/register";
import { badgeMessage } from "@/lib/stake-text";

const link = "text-primary underline-offset-4 hover:underline";
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function CopyRow({ label, value, note }: { label: string; value: string; note: string }) {
  const [done, setDone] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success(`${label} copied`);
      setTimeout(() => setDone(false), 1200);
    } catch {
      toast.error("Could not copy; select the text instead");
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {done ? <Check className="text-keeps" /> : <Copy />} {done ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="rounded-md border bg-background/60 px-2 py-1.5 font-mono text-[11px] break-all whitespace-pre-wrap text-muted-foreground">
        {value}
      </pre>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

export function SellAnywhere({ listing }: { listing: Listing }) {
  const { id, title } = listing;
  const origin = useLocal(() => window.location.origin, "");
  const source = useLocal(registerSource, "site");
  // No register at all (before the owner deploys): there is nothing to share yet.
  if (!origin || (!isMock && source === "none")) return null;

  const pack = `${origin}/pack/${id}`;
  const embed = `${origin}/embed/${id}`;
  const badge = `${origin}/api/badge/${id}`;
  const m = badgeMessage(listing);
  const preview = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(BADGE_LABEL, m.text, m.tone, MARK_PATH))}`;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Share2 className="size-4 text-primary" /> Sell it anywhere
      </h2>
      {!isMock && source === "yours" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            The card and the badge show listings of the site&apos;s own register, and this browser reads a register of its own, so
            they would show the site&apos;s {id}, not this pack. Share a pack from the site&apos;s register.
          </p>
          <YourRegisterNotice />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Show this pack on a blog, a shop or a README. The card and the badge are read from the contract on this site&apos;s
            server and refreshed about once a minute; while Studio is busy, an answer up to ten minutes old stands in. Buying
            always happens here, in a new tab: a wallet does not connect inside another site&apos;s frame.
          </p>
          <CopyRow
            label="Card (iframe)"
            value={`<iframe src="${embed}" title="${escapeAttr(title)} on As Described" width="380" height="440" style="border:0;border-radius:16px;max-width:100%" loading="lazy"></iframe>`}
            note="Title, price, promises, the stake behind them and the seller's record, with a button to buy here."
          />
          <CopyRow
            label="Badge (Markdown)"
            value={`[![As Described](${badge})](${pack})`}
            note="Sales, broken promises, the stake and what it has paid buyers on one line, linked to this page."
          />
          <CopyRow label="Link" value={pack} note="The plain address of this page." />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {/* The badge as other sites will show it: the same SVG the badge route draws, from this page's row. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={`${BADGE_LABEL}: ${m.text}`} height={20} className="h-5 w-auto" />
            <a href={`/embed/${id}`} target="_blank" rel="noopener" className={`inline-flex items-center gap-1 ${link}`}>
              Preview the card <ExternalLink className="size-3" />
            </a>
            <a href={`/api/listing/${id}`} target="_blank" rel="noopener" className={`inline-flex items-center gap-1 ${link}`}>
              The same listing as JSON <ExternalLink className="size-3" />
            </a>
          </div>
        </>
      )}
    </section>
  );
}

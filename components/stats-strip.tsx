"use client";

import { readStats, type Stats } from "@/lib/chain";
import { gen } from "@/lib/format";
import { useRead } from "@/components/use-read";
import { ReadBlock } from "@/components/read-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// The labels say what the contract counts, not what a reader might hope they mean: kept and
// broken are verdicts on disputed sections, never a score for the promises of a pack, and the
// refunded counter is the missing-section path alone. Each tile carries its one line, on hover
// and in the list under the strip, which is the one a touch screen can open.
const cells = [
  { key: "listings", label: "Packs listed", note: "Packs a seller has listed on this register." },
  { key: "orders", label: "Orders", note: "Packs bought. Each buy puts the price in escrow." },
  {
    key: "released",
    label: "Released",
    note: "Orders where the dispute window closed with no dispute, so the seller was paid.",
  },
  {
    key: "refunded",
    label: "Missing-section refunds",
    note: "Orders where a reported section never arrived on chain, so the buyer got the whole price back, plus one slice of the seller's stake when the listing has one.",
  },
  {
    key: "broken",
    label: "Disputes won by buyers (breaks)",
    note: "Disputes where the validators found the section breaks the promise: the buyer got the price and the bond back, plus one slice of the seller's stake when the listing has one.",
    tone: "text-breaks",
  },
  {
    key: "kept",
    label: "Disputes won by sellers (keeps)",
    note: "Disputes where the validators found the section keeps the promise: the seller got the price and the bond.",
    tone: "text-keeps",
  },
  {
    key: "unclear",
    label: "Unclear",
    note: "Disputes the validators could not settle either way: the seller got the price, the buyer got the bond back.",
  },
  {
    key: "stale",
    label: "Settled by rule",
    note: "Disputes nobody asked the validators about within 24 hours: the seller got the price, the buyer got the bond back.",
  },
] as const;

// The money behind the promises, on a register with stakes: a second row, in GEN.
const stakeCells: { key: string; label: string; note: string; value: (s: Stats) => string | number; tone?: string }[] = [
  {
    key: "stakeHeld",
    label: "Sellers' stake held now",
    note: "What sellers have put behind their listings and the contract still holds. One slice, half the price, backs each open order.",
    value: (s) => gen(s.stakeHeldAtto),
  },
  {
    key: "stakePaid",
    label: "Paid to buyers from stakes",
    note: "One slice of the seller's stake per breaks verdict and per reported section the seller never revealed, paid on top of the refund.",
    value: (s) => gen(s.stakePaidAtto),
    tone: "text-breaks",
  },
  {
    key: "sellers",
    label: "Sellers",
    note: "Wallets that have listed at least one pack. Each one has a public record page.",
    value: (s) => s.sellers,
  },
];

/** Live numbers from stats(): a skeleton, then the row; a failed read says so and retries. */
export function StatsStrip({ className }: { className?: string }) {
  const state = useRead(() => readStats(), []);
  return (
    <ReadBlock
      state={state}
      skeleton={
        <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)} aria-busy="true">
          {cells.map((c) => (
            <div key={c.key} className="rounded-xl border bg-card p-4">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
      }
    >
      {(s) => (
        <div className="flex flex-col gap-2">
          {s.stakeKnown ? (
            <dl className={cn("grid grid-cols-1 gap-3 sm:grid-cols-3", className)}>
              {stakeCells.map((c) => (
                <Tooltip key={c.key}>
                  <TooltipTrigger asChild>
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-left">
                      <dd className={cn("text-2xl font-semibold tabular-nums", c.key === "stakePaid" && s.stakePaidAtto !== "0" ? c.tone : undefined)}>
                        {c.value(s)}
                      </dd>
                      <dt className="mt-1 text-xs text-muted-foreground">{c.label}</dt>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72 text-xs">{c.note}</TooltipContent>
                </Tooltip>
              ))}
            </dl>
          ) : null}
          <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
            {cells.map((c) => (
              <Tooltip key={c.key}>
                <TooltipTrigger asChild>
                  <div className="rounded-xl border bg-card p-4 text-left">
                    <dd className={cn("text-2xl font-semibold tabular-nums", "tone" in c ? c.tone : undefined)}>
                      {s[c.key]}
                    </dd>
                    <dt className="mt-1 text-xs text-muted-foreground">{c.label}</dt>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-72 text-xs">{c.note}</TooltipContent>
              </Tooltip>
            ))}
          </dl>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">What each number counts</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {[...(s.stakeKnown ? stakeCells : []), ...cells].map((c) => (
                <li key={c.key}>
                  <span className="text-foreground">{c.label}:</span> {c.note}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </ReadBlock>
  );
}

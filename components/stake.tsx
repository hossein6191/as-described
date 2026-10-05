"use client";

// The seller's money behind a listing, in the words every page uses: how much stake backs it,
// how many more buyers it covers now, the seller's public record, and (for the seller only) the
// two calls that end a listing's stake: close_listing and withdraw_stake. Every number comes from
// the listing row or the seller() view; a register deployed before stakes shows none of this.

import Link from "next/link";
import { Coins, Lock, ShieldCheck } from "lucide-react";

import { TxRail } from "@/components/tx-rail";
import { Button } from "@/components/ui/button";
import { failureOf, useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import {
  closeListingCall,
  outcomeOf,
  withdrawStakeCall,
  type Listing,
  type SellerRecord,
  type WriteCall,
} from "@/lib/chain";
import { gen, short } from "@/lib/format";
import { backingText, plural } from "@/lib/stake-text";
import { cn } from "@/lib/utils";

const link = "text-primary underline-offset-4 hover:underline";

export function BackingLine({ l, className }: { l: Listing; className?: string }) {
  const text = backingText(l);
  if (!text) return null;
  const full = l.open && l.free <= 0;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", full || !l.open ? "text-gold" : "text-muted-foreground", className)}
      title={`One slice is half the price (${gen(l.sliceAtto)}). Each breaks verdict, and each reported section the seller never reveals, pays one slice to that buyer.`}
    >
      <ShieldCheck className="size-3.5 shrink-0" /> {text}
    </span>
  );
}

/**
 * A seller's record in one line, linked to their page. `record` null: the register predates seller
 * records, or the read did not answer; only the link is shown, never a made-up zero.
 */
export function SellerRecordLine({
  address,
  record,
  className,
  label = "Seller",
}: {
  address: string;
  record: SellerRecord | null;
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground", className)}>
      <span>
        {label}{" "}
        <Link href={`/seller/${address}`} className={cn(link, "font-mono")} title={address}>
          {short(address)}
        </Link>
      </span>
      {record ? (
        <>
          <span aria-hidden="true">·</span>
          <span>sold {record.sold}</span>
          <span aria-hidden="true">·</span>
          <span className={record.kept ? "text-keeps" : undefined}>kept {record.kept}</span>
          <span aria-hidden="true">·</span>
          <span className={record.broken ? "text-breaks" : undefined}>broken {record.broken}</span>
          <span aria-hidden="true">·</span>
          <span className={record.refunded ? "text-breaks" : undefined}>refunded {record.refunded}</span>
        </>
      ) : null}
    </span>
  );
}

/** One sentence on where this listing's stake stands, for its seller. */
function stakeState(l: Listing): string {
  const stake = BigInt(l.stakeAtto);
  const open = plural(l.openOrders, "open order", "open orders");
  if (l.open) {
    const backs = `Your ${gen(stake)} stake backs ${plural(l.capacity, "open order", "open orders")} at a time; ${l.openOrders} ${l.openOrders === 1 ? "is" : "are"} open now`;
    const then =
      l.openOrders === 0
        ? `Closing stops new orders and returns the whole ${gen(stake)} in the same call.`
        : `Closing stops new orders; the stake stays until ${l.openOrders === 1 ? "the open order ends" : `the ${open} end`}, then you withdraw it.`;
    return `${backs}${l.free <= 0 ? ", so nobody else can buy until one ends" : ""}. ${then}`;
  }
  if (stake > 0n && l.openOrders > 0) return `Closed. ${gen(stake)} of stake still backs ${open}; withdraw it once ${l.openOrders === 1 ? "it ends" : "they end"}.`;
  if (stake > 0n) return `Closed with nothing open: the ${gen(stake)} left is yours to withdraw.`;
  if (l.closedReason === "out_of_stake") {
    return `Closed itself: buyers were paid ${gen(l.stakePaidAtto)} from its stake and less than one slice was left. Nothing to withdraw.`;
  }
  // The row cannot tell a slash that took the rest after closing from a return, so a stake buyers
  // were paid from is only said to be empty. With nothing paid, the whole stake did come back.
  return BigInt(l.stakePaidAtto) > 0n
    ? `Closed. Buyers were paid ${gen(l.stakePaidAtto)} from its stake; nothing is left on it.`
    : "Closed. The stake has come back to you.";
}

/**
 * Close and Withdraw for a listing's seller. `canAct` is false for anyone else (they see the
 * state, not the buttons). On a register without stakes only Close is offered, as before.
 */
export function StakeControls({
  l,
  canAct,
  onChanged,
  className,
}: {
  l: Listing;
  canAct: boolean;
  onChanged: () => void;
  className?: string;
}) {
  const closeTx = useTx((s) => {
    if (s.applied && !failureOf(s)) onChanged();
  });
  const withdrawTx = useTx((s) => {
    if (s.applied && !failureOf(s)) onChanged();
  });
  const running = (t: typeof closeTx) => t.sending || (!!t.hash && !t.final);
  const busy = running(closeTx) || running(withdrawTx);
  const stake = l.stakeKnown ? BigInt(l.stakeAtto) : 0n;
  const canWithdraw = l.stakeKnown && !l.open && l.openOrders === 0 && stake > 0n;
  const closed = outcomeOf(closeTx.final?.result);
  const withdrawn = outcomeOf(withdrawTx.final?.result);
  const start = (t: typeof closeTx, c: WriteCall) => void t.start(c.fn, c.args, c.value);

  return (
    <div className={cn("space-y-2 text-xs", className)}>
      {l.stakeKnown ? (
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" /> <span>{stakeState(l)}</span>
        </p>
      ) : null}
      {canAct && (l.open || canWithdraw) ? (
        <WalletGate action={l.open ? "close the listing" : "withdraw the stake"}>
          <div className="flex flex-wrap gap-2">
            {l.open ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => start(closeTx, closeListingCall(l.id))}>
                Close listing
              </Button>
            ) : null}
            {canWithdraw ? (
              <Button type="button" size="sm" variant="cool" disabled={busy} onClick={() => start(withdrawTx, withdrawStakeCall(l.id))}>
                <Coins /> Withdraw {gen(stake)}
              </Button>
            ) : null}
          </div>
        </WalletGate>
      ) : null}
      {[
        { t: closeTx, label: `Closing ${l.id}`, done: closed },
        { t: withdrawTx, label: `Withdrawing the stake of ${l.id}`, done: withdrawn },
      ].map(({ t, label, done }) => (
        <div key={label} className="space-y-1">
          {t.error ? <p className="text-breaks">{t.error}</p> : null}
          {t.hash ? <TxRail hash={t.hash} label={label} onDone={t.onDone} /> : null}
          {t.final && failureOf(t.final) ? <p className="text-breaks">{failureOf(t.final)}</p> : null}
          {t.final && !failureOf(t.final) && done ? (
            <p className="text-keeps">
              {BigInt(done.returnedAtto) > 0n
                ? `${gen(done.returnedAtto)} of stake came back to your wallet in the same call; it lands a few seconds after FINALIZED.`
                : t === closeTx && l.stakeKnown
                  ? "Closed. The stake stays until the open orders end; then withdraw it here."
                  : "Done."}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

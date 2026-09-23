"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BellRing, Coins, Info, RefreshCw, Upload } from "lucide-react";

import { LedgerTable } from "@/components/ledger-table";
import { BlockSkeleton, ReadBlock, readEach } from "@/components/read-state";
import { YourRegisterNotice } from "@/components/register-line";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tally } from "@/components/ui/product-card";
import { TxRail } from "@/components/tx-rail";
import { WalletGate } from "@/components/wallet-gate";
import { useRead } from "@/components/use-read";
import { useTx, failureOf } from "@/components/use-tx";
import { useWallet } from "@/components/wallet";
import {
  chainTime,
  invalidateReads,
  parseChainTime,
  isMock,
  readAllListings,
  readLedger,
  readOrder,
  readOrdersOf,
  readOrdersOfBuyer,
  type LedgerRow,
  type Listing,
  type Order,
} from "@/lib/chain";
import { MOCK_BUYER, mockPackUploaded } from "@/lib/chain-mock";
import { packStatus } from "@/lib/api";
import { isDemoHashes } from "@/lib/demo-keys";
import { countdown, gen, kindEmoji, short, when, windowLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The contract's ledger view answers at most this many rows, newest first. */
const LEDGER_ROWS = 50;
/** Full order reads per visit (deadlines and the chain's clock are not in the ledger rows). */
const DETAIL_READS = 12;
/** Sales listed under each pack; the pack page has them all. */
const SHOWN_SALES = 6;
/** as_described.py REVEAL_HOURS and STALE_HOURS. */
const REVEAL_HOURS = 24;
const STALE_HOURS = 24;

type Mine = {
  /** orders this wallet paid, newest first */
  bought: LedgerRow[];
  /** order ids of this wallet that were neither in the ledger nor read on this visit */
  boughtUnread: string[];
  /** packs this wallet listed, newest first */
  listings: Listing[];
  /** listing id → its orders, newest first */
  sales: Record<string, LedgerRow[]>;
  salesUnread: Record<string, string[]>;
  /** full order rows read on this visit, by id */
  details: Record<string, Order>;
  /** reads that did not answer on this visit */
  failed: number;
};

const orderNo = (id: string) => Number(id.replace(/^\D+/, "")) || 0;
const oldestFirst = (a: LedgerRow, b: LedgerRow) => orderNo(a.id) - orderNo(b.id);
const newestFirst = (a: LedgerRow, b: LedgerRow) => orderNo(b.id) - orderNo(a.id);

/**
 * Everything /orders shows, from three shared reads: this wallet's order ids, the listings view,
 * and the ledger (the latest 50 orders with status, verdict and money). Single orders are read
 * only where those cannot answer: the deadlines of sales and reports that may need the seller,
 * and orders older than the ledger. Those go three at a time, at most DETAIL_READS per visit.
 */
async function readMine(address: string) {
  const me = address.toLowerCase();
  const [boughtIds, all, ledger] = await Promise.all([readOrdersOfBuyer(me), readAllListings(), readLedger(LEDGER_ROWS)]);
  let snapshot = [boughtIds, all, ledger].some((r) => r.source === "snapshot");
  let failed = 0;

  const rowById = new Map(ledger.data.map((r) => [r.id, r] as const));
  const listings = all.data.filter((l) => l.seller.toLowerCase() === me).reverse();
  // Packs with sales first: a seller with a shelf of demo packs still sees the ones that need them.
  listings.sort((a, b) => (b.orders > 0 ? 1 : 0) - (a.orders > 0 ? 1 : 0));
  const sales: Record<string, LedgerRow[]> = {};
  for (const l of listings) sales[l.id] = [];
  for (const r of ledger.data) sales[r.listing]?.push(r);

  // A pack with more orders than the ledger shows (older than the latest 50, or newer than the
  // cached ledger): read its id list to learn which ones are missing.
  const unknownSales: { id: string; listing: string }[] = [];
  const behind = listings.filter((l) => l.orders > sales[l.id].length);
  const idLists = await readEach(behind, (l) => readOrdersOf(l.id));
  idLists.forEach((r, i) => {
    if (r.status !== "fulfilled") {
      failed++;
      return;
    }
    snapshot ||= r.value.source === "snapshot";
    for (const id of r.value.data.slice().reverse()) if (!rowById.has(id)) unknownSales.push({ id, listing: behind[i].id });
  });
  const unknownBought = boughtIds.data.filter((id) => !rowById.has(id)).reverse();

  // What to read in full, most urgent first: reported sections (a 24 h clock), then sales whose
  // window may have closed (oldest first), then orders the ledger does not reach.
  const mySales = listings.flatMap((l) => sales[l.id]);
  const myBought = boughtIds.data.map((id) => rowById.get(id)).filter((r): r is LedgerRow => !!r);
  const queue = [
    ...mySales.filter((r) => r.status === "missing").map((r) => r.id),
    ...myBought.filter((r) => r.status === "missing").map((r) => r.id),
    ...mySales.filter((r) => r.status === "paid").sort(oldestFirst).map((r) => r.id),
    ...unknownSales.map((u) => u.id),
    ...unknownBought,
  ].filter((id, i, list) => list.indexOf(id) === i);
  const picked = queue.slice(0, DETAIL_READS);
  const reads = await readEach(picked, (id) => readOrder(id));
  const details: Record<string, Order> = {};
  reads.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.data) {
      details[picked[i]] = r.value.data;
      snapshot ||= r.value.source === "snapshot";
    } else if (r.status === "rejected") {
      failed++;
    }
  });

  // A full read is newer than the ledger row: show it in the lists too.
  const rowOf = (id: string): LedgerRow | undefined => details[id] ?? rowById.get(id);
  const salesUnread: Record<string, string[]> = {};
  for (const l of listings) {
    sales[l.id] = sales[l.id].map((r) => rowOf(r.id) ?? r);
    salesUnread[l.id] = [];
  }
  for (const u of unknownSales) {
    const row = rowOf(u.id);
    if (row) sales[u.listing].push(row);
    else salesUnread[u.listing].push(u.id);
  }
  for (const l of listings) sales[l.id].sort(newestFirst);
  const bought: LedgerRow[] = [];
  const boughtUnread: string[] = [];
  for (const id of boughtIds.data.slice().reverse()) {
    const row = rowOf(id);
    if (row) bought.push(row);
    else boughtUnread.push(id);
  }

  const data: Mine = { bought, boughtUnread, listings, sales, salesUnread, details, failed };
  return { data, source: snapshot ? "snapshot" : "chain" } as const;
}

/** Re-renders every `ms` so deadlines and countdowns stay current while the page is open. */
function useNow(ms: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * An instant the contract wrote, as an ISO string this browser can format and count down from
 * (the contract's own "now" carries microseconds, which not every browser parses). "" when
 * there is nothing to read.
 */
const readable = (ms: number): string => (Number.isFinite(ms) ? new Date(ms).toISOString() : "");
/** The moment the seller's time to reveal a reported section runs out; NaN when not reported. */
const revealDeadline = (o: Order | undefined): number =>
  o ? parseChainTime(o.missingAt) + REVEAL_HOURS * 3600_000 : NaN;
const passed = (o: Order, deadline: number, now: number) => Number.isFinite(deadline) && chainTime(o, now) >= deadline;

/** True once a paid order's dispute window has closed, by the chain's clock. */
function windowClosed(o: Order, now: number): boolean {
  return o.status === "paid" && passed(o, parseChainTime(o.deadlineAt), now);
}

type Action = {
  key: string;
  tone: "urgent" | "act" | "info";
  order: string;
  text: React.ReactNode;
  cta: string;
  /** a closed window the seller can release from here */
  release?: LedgerRow;
};

const TONE_RANK: Record<Action["tone"], number> = { urgent: 0, act: 1, info: 2 };

/** What this wallet owes or can do next, as seller and as buyer. */
function actionsOf(m: Mine, now: number): Action[] {
  const out: Action[] = [];
  const pack = (r: LedgerRow) => r.title || r.listing;
  for (const l of m.listings) {
    for (const r of m.sales[l.id]) {
      const d = m.details[r.id];
      if (r.status === "missing") {
        const deadline = readable(revealDeadline(d));
        const section = d && d.missingIndex >= 0 ? `section ${d.missingIndex + 1}` : "a section";
        if (d && deadline && passed(d, revealDeadline(d), now)) {
          out.push({
            key: `lapsed-${r.id}`,
            tone: "info",
            order: r.id,
            text: (
              <>
                The {REVEAL_HOURS} hours to reveal {section} of {pack(r)} have passed. Anyone can now refund the buyer&apos;s{" "}
                {gen(r.priceAtto)} in full.
              </>
            ),
            cta: `Open ${r.id}`,
          });
        } else {
          out.push({
            key: `reveal-${r.id}`,
            tone: "urgent",
            order: r.id,
            text: deadline ? (
              <>
                The buyer reports {section} of {pack(r)} missing. Put its exact text on chain by{" "}
                <strong>{when(deadline)}</strong> ({countdown(deadline, chainTime(d!, now))}), or the buyer gets the full{" "}
                {gen(r.priceAtto)} back.
              </>
            ) : (
              <>
                The buyer reports {section} of {pack(r)} missing. You have {REVEAL_HOURS} hours from the report to put its exact
                text on chain, or the buyer gets the full {gen(r.priceAtto)} back.
              </>
            ),
            cta: `Reveal on ${r.id}`,
          });
        }
      } else if (r.status === "paid" && d && windowClosed(d, now)) {
        out.push({
          key: `release-${r.id}`,
          tone: "act",
          order: r.id,
          text: (
            <>
              The dispute window on {pack(r)} closed with no dispute. Release your {gen(r.priceAtto)}: anyone may send it, you
              included.
            </>
          ),
          cta: `Open ${r.id}`,
          release: r,
        });
      } else if (r.status === "disputed" && !r.verdict) {
        const what = r.sectionIndex >= 0 && r.promiseIndex >= 0 ? `section ${r.sectionIndex + 1} against P${r.promiseIndex + 1}` : "a section";
        out.push({
          key: `disputed-${r.id}`,
          tone: "info",
          order: r.id,
          text: (
            <>
              The buyer disputed {what} of {pack(r)}. Nothing moves until someone presses Ask the validators on the order page, and
              you may press it too. With no verdict {STALE_HOURS} hours after the dispute, anyone can settle it by rule: the price
              to you, the bond back to the buyer.
            </>
          ),
          cta: `Open ${r.id}`,
        });
      }
    }
  }
  for (const r of m.bought) {
    const d = m.details[r.id];
    if (r.status === "disputed" && !r.verdict) {
      const what = r.sectionIndex >= 0 && r.promiseIndex >= 0 ? `section ${r.sectionIndex + 1} against P${r.promiseIndex + 1}` : "your section";
      out.push({
        key: `judge-${r.id}`,
        tone: "act",
        order: r.id,
        text: (
          <>
            Your dispute of {what} on {pack(r)} is waiting for the validators. Press Ask the validators on the order page: the
            verdict and the money move in that one transaction.
          </>
        ),
        cta: `Ask the validators on ${r.id}`,
      });
    } else if (r.status === "missing") {
      const deadline = readable(revealDeadline(d));
      const section = d && d.missingIndex >= 0 ? `section ${d.missingIndex + 1}` : "the section";
      if (d && deadline && passed(d, revealDeadline(d), now)) {
        out.push({
          key: `refund-${r.id}`,
          tone: "act",
          order: r.id,
          text: (
            <>
              The seller did not put {section} of {pack(r)} on chain within {REVEAL_HOURS} hours. Take your full{" "}
              {gen(r.priceAtto)} refund on the order page.
            </>
          ),
          cta: `Refund on ${r.id}`,
        });
      } else {
        out.push({
          key: `waiting-${r.id}`,
          tone: "info",
          order: r.id,
          text: deadline ? (
            <>
              You reported {section} of {pack(r)} missing. The seller has until {when(deadline)} ({countdown(deadline, chainTime(d!, now))})
              to put it on chain; if they do not, you take a full refund.
            </>
          ) : (
            <>
              You reported {section} of {pack(r)} missing. The seller has {REVEAL_HOURS} hours from the report to put it on chain; if
              they do not, you take a full refund.
            </>
          ),
          cta: `Open ${r.id}`,
        });
      }
    }
  }
  return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

function ReleaseButton({ row, onChanged }: { row: LedgerRow; onChanged: () => void }) {
  const tx = useTx((s) => {
    if (s.applied && !failureOf(s)) onChanged();
  });
  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="cool" disabled={tx.sending || (!!tx.hash && !tx.final)} onClick={() => void tx.start("release", [row.id])}>
        <Coins /> Release {gen(row.priceAtto)}
      </Button>
      {tx.error ? <p className="text-xs text-breaks">{tx.error}</p> : null}
      {tx.hash ? <TxRail hash={tx.hash} label={`Releasing ${row.id} to you`} onDone={tx.onDone} /> : null}
      {tx.final && failureOf(tx.final) ? <p className="text-xs text-breaks">{failureOf(tx.final)}</p> : null}
    </div>
  );
}

function NextSteps({ actions, live, onChanged }: { actions: Action[]; live: boolean; onChanged: () => void }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <BellRing className="size-4 text-gold" /> Needs you ({actions.length})
      </h2>
      <ul className="space-y-2">
        {actions.map((a) => (
          <li
            key={a.key}
            className={cn(
              "space-y-3 rounded-xl border p-4 text-sm",
              a.tone === "urgent" ? "border-gold/50 bg-gold/10" : a.tone === "act" ? "border-primary/40 bg-primary/5" : "bg-card",
            )}
          >
            <div className="flex items-start gap-2">
              {a.tone === "urgent" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" />
              ) : a.tone === "act" ? (
                <Coins className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <p>
                <Link href={`/order/${a.order}`} className="mr-1 font-mono font-medium text-primary underline-offset-4 hover:underline">
                  {a.order}
                </Link>{" "}
                {a.text}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2 pl-6">
              {a.release && live ? <ReleaseButton row={a.release} onChanged={onChanged} /> : null}
              <Button asChild size="sm" variant={a.release && live ? "outline" : a.tone === "info" ? "outline" : "cool"}>
                <Link href={`/order/${a.order}`}>
                  {a.cta} <ArrowRight />
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One line of money or clock for a sale, from the fullest row this visit has. */
function saleNote(r: LedgerRow, d: Order | undefined, now: number): string {
  const toBuyer = BigInt(r.paidBuyer || "0");
  const toSeller = BigInt(r.paidSeller || "0");
  if (toBuyer > 0n || toSeller > 0n) {
    const parts: string[] = [];
    if (toSeller > 0n) parts.push(`${gen(toSeller)} to you`);
    if (toBuyer > 0n) parts.push(`${gen(toBuyer)} back to the buyer`);
    return parts.join(", ");
  }
  if (r.status === "paid" && d) {
    return windowClosed(d, now)
      ? `${gen(r.priceAtto)} ready to release`
      : `${gen(r.priceAtto)} in escrow, window ${countdown(readable(parseChainTime(d.deadlineAt)), chainTime(d, now))}`;
  }
  return r.status === "paid" || r.status === "disputed" || r.status === "missing" ? `${gen(r.priceAtto)} in escrow` : "";
}

function OrderLinks({ ids, label }: { ids: string[]; label: string }) {
  if (!ids.length) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {label}{" "}
      {ids.map((o, i) => (
        <span key={o}>
          {i > 0 ? ", " : null}
          <Link href={`/order/${o}`} className="font-mono text-primary underline-offset-4 hover:underline">
            {o}
          </Link>
        </span>
      ))}
    </p>
  );
}

function MyListing({
  l,
  sales,
  unread,
  details,
  now,
  onChanged,
}: {
  l: Listing;
  sales: LedgerRow[];
  unread: string[];
  details: Record<string, Order>;
  now: number;
  onChanged: () => void;
}) {
  const tx = useTx((s) => {
    if (s.applied && !failureOf(s)) onChanged();
  });
  // Whether buyers can actually read the pack: the text must have reached the store (or be a demo pack).
  const [uploaded, setUploaded] = React.useState<boolean | null>(null);
  const hashKey = l.hashes.join(",");
  React.useEffect(() => {
    let alive = true;
    if (isMock) {
      Promise.resolve(mockPackUploaded(l.id)).then((u) => alive && setUploaded(u));
    } else {
      // A demo pack's text ships with the site: it is delivered without asking the store.
      isDemoHashes(hashKey ? hashKey.split(",") : [])
        // demo is false here, so the status route answers from the store alone: no second listing read.
        // null when the store never answered: the seller is never told a delivered pack is missing.
        .then((demo) => (demo ? true : packStatus(l.id, { demo: false }).then((s) => (s.checked ? s.uploaded : null))))
        .then((u) => alive && setUploaded(u))
        .catch(() => alive && setUploaded(null));
    }
    return () => {
      alive = false;
    };
  }, [l.id, hashKey]);
  const shown = sales.slice(0, SHOWN_SALES);
  return (
    <li className="rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/pack/${l.id}`} className="font-medium underline-offset-4 hover:underline">
            <span className="mr-1" aria-hidden="true">
              {kindEmoji(l.kind)}
            </span>
            {l.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {l.id} · {gen(l.priceAtto)} · window {windowLabel(l.windowSeconds)} · {l.orders} {l.orders === 1 ? "order" : "orders"}
          </p>
          <Tally kept={l.kept} broken={l.broken} unclear={l.unclear} className="mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{l.open ? "open" : "closed"}</Badge>
          {l.open ? (
            <Button type="button" size="sm" variant="outline" disabled={tx.sending || (!!tx.hash && !tx.final)} onClick={() => void tx.start("close_listing", [l.id])}>
              Close listing
            </Button>
          ) : null}
        </div>
      </div>
      {uploaded === false ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 shrink-0 text-gold" />
            The text of this pack is not uploaded yet, so buyers cannot read it.
          </span>
          <Button asChild size="sm" variant="cool">
            <Link href={`/sell?upload=${l.id}`}>
              <Upload /> Upload the text
            </Link>
          </Button>
        </div>
      ) : null}
      {tx.error ? <p className="mt-2 text-xs text-breaks">{tx.error}</p> : null}
      {tx.hash ? (
        <div className="mt-3">
          <TxRail hash={tx.hash} label={`Closing ${l.id}`} onDone={tx.onDone} />
          {tx.final && failureOf(tx.final) ? <p className="mt-2 text-xs text-breaks">{failureOf(tx.final)}</p> : null}
        </div>
      ) : null}
      {shown.length === 0 && unread.length === 0 ? null : (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Sales</p>
          <ul className="divide-y rounded-lg border">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/order/${r.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                    {r.id}
                  </Link>
                  <StatusBadge status={r.status} verdict={r.verdict} />
                  <span className="font-mono text-muted-foreground" title={r.buyer}>
                    buyer {short(r.buyer)}
                  </span>
                </span>
                <span className="text-muted-foreground">{saleNote(r, details[r.id], now)}</span>
              </li>
            ))}
          </ul>
          {sales.length > shown.length ? (
            <p className="text-xs text-muted-foreground">
              Showing the latest {shown.length} of {sales.length}.{" "}
              <Link href={`/pack/${l.id}`} className="text-primary underline-offset-4 hover:underline">
                Every order is on the pack page.
              </Link>
            </p>
          ) : null}
          <OrderLinks ids={unread} label="Older sales, not read on this visit:" />
        </div>
      )}
    </li>
  );
}

export default function OrdersPage() {
  const w = useWallet();
  // Mock mode has no wallet: show the mock buyer's orders so the page has something to render.
  const address = w.address || (isMock ? MOCK_BUYER : "");
  const state = useRead(() => readMine(address), [address], { enabled: !!address });
  const now = useNow(15_000);
  // Refresh means a live read: drop the 30 s cache first, or the button hands back the same rows.
  const refresh = () => {
    invalidateReads();
    state.retry();
  };

  return (
    <div className="container-site space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My orders</h1>
          <p className="text-muted-foreground">Orders paid by the connected wallet, the packs it listed with their sales, and what needs you next.</p>
        </div>
        {address ? (
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={state.loading}>
            <RefreshCw className={state.loading ? "animate-spin" : undefined} /> Refresh
          </Button>
        ) : null}
      </div>

      <WalletGate action="see your orders">
        <ReadBlock
          state={state}
          skeleton={
            <div className="space-y-3">
              <BlockSkeleton lines={2} />
              <BlockSkeleton lines={2} />
            </div>
          }
        >
          {(m) => {
            const actions = actionsOf(m, now);
            const live = state.source !== "snapshot";
            return (
              <div className="space-y-10">
                {actions.length > 0 ? (
                  <NextSteps actions={actions} live={live} onChanged={() => void state.refresh()} />
                ) : m.listings.length > 0 || m.bought.length > 0 ? (
                  <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                    Nothing needs you right now. This page flags a section a buyer reports missing (you then have {REVEAL_HOURS} hours
                    to reveal it), a sale whose window closed (release it), and a dispute waiting for the validators.
                  </p>
                ) : null}
                {m.failed > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {m.failed} {m.failed === 1 ? "read" : "reads"} did not answer on this visit (Studio allows 30 reads a minute from
                    one browser). Refresh in a minute to fill {m.failed === 1 ? "it" : "them"} in.
                  </p>
                ) : null}

                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Orders ({m.bought.length + m.boughtUnread.length})</h2>
                  {m.bought.length === 0 && m.boughtUnread.length === 0 ? (
                    <div className="space-y-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      <p>
                        This wallet has not bought a pack yet.{" "}
                        <Link href="/shop" className="text-primary underline-offset-4 hover:underline">
                          Open the shop.
                        </Link>
                      </p>
                      <YourRegisterNotice />
                    </div>
                  ) : (
                    <>
                      {m.bought.length > 0 ? <LedgerTable rows={m.bought} /> : null}
                      <OrderLinks ids={m.boughtUnread} label="Older orders, not read on this visit:" />
                    </>
                  )}
                </section>
                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Packs you listed ({m.listings.length})</h2>
                  {m.listings.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      Nothing listed from this wallet.{" "}
                      <Link href="/sell" className="text-primary underline-offset-4 hover:underline">
                        Sell a pack.
                      </Link>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {m.listings.map((l) => (
                        <MyListing
                          key={l.id}
                          l={l}
                          sales={m.sales[l.id] ?? []}
                          unread={m.salesUnread[l.id] ?? []}
                          details={m.details}
                          now={now}
                          onChanged={() => void state.refresh()}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            );
          }}
        </ReadBlock>
      </WalletGate>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Circle, Clock, FileQuestion, Gavel, Loader2, ShieldAlert, X } from "lucide-react";

import { Address, TxLink } from "@/components/address";
import { PromisePills } from "@/components/promise-pills";
import { BlockSkeleton, ReadBlock } from "@/components/read-state";
import { StatusBadge } from "@/components/status-badge";
import { TxRail } from "@/components/tx-rail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedTicket } from "@/components/ui/ticket-confirmation-card";
import { useRead, useSearchString } from "@/components/use-read";
import { cleanWalletError, failureOf, useTx } from "@/components/use-tx";
import { useWallet } from "@/components/wallet";
import { WalletGate } from "@/components/wallet-gate";
import { balanceOf, isMock, readListing, readOrder, type Listing, type Order, type OrderStatus, type TxStatus } from "@/lib/chain";
import { fetchPack, readMessage, sha256Hex } from "@/lib/api";
import { mockPackSections } from "@/lib/chain-mock";
import { countdown, gen, plusHours, statusLabel, when, windowLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const REVEAL_HOURS = 24;
const STALE_HOURS = 24;

async function readOrderPage(id: string) {
  const o = await readOrder(id);
  if (!o.data) return { data: null, source: o.source } as const;
  const l = await readListing(o.data.listing);
  const source = o.source === "snapshot" || l.source === "snapshot" ? "snapshot" : "chain";
  return { data: { order: o.data, listing: l.data }, source } as const;
}

type SectionRow = { index: number; text: string | null; ok: boolean | null };

/** Who is looking at the page: the buyer, the seller, or anyone else (a visitor, no wallet). */
type Viewer = "buyer" | "seller" | "other";

/** The pack store answered that there is nothing to serve; the section list is still shown, every row "not delivered". */
const isUndeliveredReason = (reason: string) => /not uploaded|could not be opened/i.test(reason);

/**
 * The verdict sentence, written by the site from the closed set. Nothing the model wrote is shown.
 * Amounts come from paid_buyer / paid_seller once the order is settled (the contract zeroes the bond
 * at settlement, so price + bond is only right before it), and the sentence is written for the viewer.
 */
function verdictSentence(o: Order, viewer: Viewer): string {
  const s = o.sectionIndex + 1;
  const p = o.promiseIndex + 1;
  const settled = o.status === "settled";
  const paidBuyer = BigInt(o.paidBuyer || "0");
  const paidSeller = BigInt(o.paidSeller || "0");
  const priceAndBond = BigInt(o.priceAtto) + BigInt(o.bondAtto);
  const toBuyer = settled && paidBuyer > 0n ? gen(paidBuyer) : gen(priceAndBond);
  const toSeller = settled && paidSeller > 0n ? gen(paidSeller) : gen(priceAndBond);
  if (o.verdict === "breaks") {
    const who = viewer === "buyer" ? "is on its way back to you" : viewer === "seller" ? "goes back to the buyer, their bond with it" : "goes back to the buyer";
    return `The validators agreed: section ${s} breaks promise ${p}. ${toBuyer} ${who}.`;
  }
  if (o.verdict === "keeps") {
    const who = viewer === "buyer" ? "goes to the seller, your bond with it" : viewer === "seller" ? "goes to you, the seller, the buyer's bond with it" : "goes to the seller, the buyer's bond with it";
    return `The validators agreed: section ${s} keeps promise ${p}. ${toSeller} ${who}.`;
  }
  if (o.verdict === "unclear") {
    const price = settled && paidSeller > 0n ? gen(paidSeller) : gen(o.priceAtto);
    const bond = settled && paidBuyer > 0n ? gen(paidBuyer) : gen(o.bondAtto);
    const who =
      viewer === "buyer"
        ? `The seller receives ${price}; your ${bond} bond comes back to you.`
        : viewer === "seller"
          ? `You, the seller, receive ${price}; the buyer's ${bond} bond goes back to the buyer.`
          : `The seller receives ${price}; the buyer's ${bond} bond goes back to the buyer.`;
    return `The validators could not tell whether section ${s} breaks promise ${p}. ${who}`;
  }
  return "";
}

const hoursSince = (iso: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : 0);

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const w = useWallet();
  const page = useRead(() => readOrderPage(id), [id]);

  // ?tx=…&new=1 → barcode and a one-time confetti (once per order per browser)
  const search = useSearchString();
  const txHash = React.useMemo(() => new URLSearchParams(search).get("tx") ?? "", [search]);
  const isNew = React.useMemo(() => new URLSearchParams(search).get("new") === "1", [search]);
  const [confetti, setConfetti] = React.useState(false);
  React.useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => {
      try {
        const key = `ad:seen:${id}`;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch {}
      setConfetti(true);
    }, 0);
    return () => clearTimeout(t);
  }, [id, isNew]);

  // a clock for countdowns
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- the pack: one personal_sign, cached per order ----
  const [sections, setSections] = React.useState<SectionRow[] | null>(null);
  const [packError, setPackError] = React.useState("");
  const [packBusy, setPackBusy] = React.useState(false);
  const order = page.data?.order ?? null;
  const listing = page.data?.listing ?? null;

  const verify = React.useCallback(async (texts: string[], hashes: string[]) => {
    const rows: SectionRow[] = [];
    for (let i = 0; i < hashes.length; i++) {
      const text = texts[i] ?? null;
      rows.push({ index: i, text, ok: text === null ? null : (await sha256Hex(text)) === hashes[i] });
    }
    setSections(rows);
  }, []);

  const loadPack = React.useCallback(
    async (o: Order, l: Listing, sig?: string) => {
      setPackBusy(true);
      setPackError("");
      try {
        if (isMock) {
          const texts = mockPackSections(o.listing) ?? [];
          await verify(texts, l.hashes);
          return;
        }
        let signature = sig;
        if (!signature) {
          signature = await w.signMessage(readMessage(o.id));
          try {
            localStorage.setItem(`ad:sig:${o.id}`, signature);
          } catch {}
        }
        const r = await fetchPack(o.listing, o.id, w.address, signature);
        if (!r.ok || !r.sections) {
          const reason = r.reason || "The delivery store refused the request.";
          // Nothing stored for this listing: the signature was fine, so keep it, and show the
          // section list from the committed hashes with every row "not delivered".
          if (isUndeliveredReason(reason)) {
            await verify([], l.hashes);
            setPackError(reason);
            return;
          }
          if (sig) {
            try {
              localStorage.removeItem(`ad:sig:${o.id}`);
            } catch {}
          }
          throw new Error(reason);
        }
        await verify(r.sections, l.hashes);
      } catch (e) {
        setPackError(cleanWalletError(e instanceof Error ? e.message : String(e)));
      } finally {
        setPackBusy(false);
      }
    },
    [verify, w],
  );

  // auto-load with a cached signature (or straight away in mock mode)
  const autoTried = React.useRef("");
  React.useEffect(() => {
    if (!order || !listing || sections || autoTried.current === order.id) return;
    autoTried.current = order.id;
    const t = setTimeout(() => {
      if (isMock) {
        void loadPack(order, listing);
        return;
      }
      let cached = "";
      try {
        cached = localStorage.getItem(`ad:sig:${order.id}`) ?? "";
      } catch {}
      if (cached && w.address && w.address.toLowerCase() === order.buyer.toLowerCase()) void loadPack(order, listing, cached);
      else autoTried.current = "";
    }, 0);
    return () => clearTimeout(t);
  }, [order, listing, sections, loadPack, w.address]);

  // ---- dispute: pick a promise, post the bond, ask the validators ----
  const [pick, setPick] = React.useState<{ section: number; promise: number } | null>(null);
  const [dialogSection, setDialogSection] = React.useState<number | null>(null);
  const [pasted, setPasted] = React.useState("");
  const [balanceBefore, setBalanceBefore] = React.useState<bigint | null>(null);
  const [landed, setLanded] = React.useState<null | "yes" | "timeout">(null);

  // A write that was applied changes the order's status, but the node answers the next read
  // with the old row for a few seconds. After such a write the page re-reads every 3 s until the
  // status it started from is gone (or 20 tries passed), so no button is drawn against a stale row.
  const [awaitFrom, setAwaitFrom] = React.useState<OrderStatus | null>(null);
  const awaitTries = React.useRef(0);
  const refreshRef = React.useRef(page.refresh);
  React.useEffect(() => {
    refreshRef.current = page.refresh;
  });
  const applied = (s: TxStatus) => {
    if (!s.applied || failureOf(s)) return;
    awaitTries.current = 0;
    setAwaitFrom(order?.status ?? null);
    void page.refresh();
  };
  const stillOld = !!awaitFrom && !!order && order.status === awaitFrom;
  React.useEffect(() => {
    if (!stillOld || awaitTries.current >= 20) return;
    const t = setTimeout(() => {
      awaitTries.current += 1;
      void refreshRef.current();
    }, 3000);
    return () => clearTimeout(t);
  }, [stillOld, order]);

  const bondTx = useTx(applied);
  const judgeTx = useTx(applied);
  const releaseTx = useTx(applied);
  const missingTx = useTx(applied);
  const revealTx = useTx(applied);
  const ruleTx = useTx(applied);

  const startBond = async (o: Order, section: number, promise: number) => {
    setPick({ section, promise });
    judgeTx.reset();
    setLanded(null);
    await bondTx.start("open_dispute", [o.id, String(section), String(promise)], BigInt(o.bondRequiredAtto));
  };

  const startJudge = async (o: Order, text: string) => {
    setLanded(null);
    try {
      setBalanceBefore(await balanceOf(o.buyer));
    } catch {
      setBalanceBefore(null);
    }
    await judgeTx.start("judge", [o.id, text]);
  };

  // "refund landed": money moves a few seconds after FINALIZED, so poll the buyer's balance until it moved
  React.useEffect(() => {
    if (!order || !judgeTx.final || failureOf(judgeTx.final) || balanceBefore === null) return;
    if (order.verdict !== "breaks" && order.verdict !== "unclear") return;
    let alive = true;
    let tries = 0;
    const poll = async () => {
      while (alive && tries < 25) {
        tries += 1;
        try {
          const b = await balanceOf(order.buyer);
          if (b !== balanceBefore) {
            if (alive) setLanded("yes");
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (alive) setLanded("timeout");
    };
    void poll();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.verdict, judgeTx.final, balanceBefore]);

  const watching =
    !!order && !!judgeTx.final && !failureOf(judgeTx.final) && balanceBefore !== null && landed === null && (order.verdict === "breaks" || order.verdict === "unclear");

  // Mock mode has no wallet, so it plays both sides: the buyer's buttons and the seller's reveal box.
  const me = w.address.toLowerCase();
  const isBuyer = !!order && (isMock || (!!me && me === order.buyer.toLowerCase()));
  const isSeller = !!order && (isMock || (!!me && me === order.seller.toLowerCase()));
  const viewer: Viewer = isBuyer ? "buyer" : isSeller ? "seller" : "other";

  return (
    <div className="container-site space-y-10 py-8">
      <ReadBlock
        state={page}
        skeleton={
          <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
            <Skeleton className="h-[28rem] w-full max-w-sm rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-2/3" />
              <BlockSkeleton lines={3} />
              <BlockSkeleton lines={5} />
            </div>
          </div>
        }
        emptyWhen={(d) => d === null}
        empty={
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            The network answered, and there is no order called <span className="font-mono">{id}</span> on this contract.{" "}
            <Link href="/ledger" className="text-primary underline-offset-4 hover:underline">
              Open the ledger.
            </Link>
          </div>
        }
      >
        {(d) => {
          const o = d!.order;
          const l = d!.listing;
          const deadlinePassed = new Date(o.deadlineAt).getTime() <= now;
          const windowOpen = o.status === "paid" && !deadlinePassed;
          const canRelease = o.status === "paid" && deadlinePassed;
          const revealDeadline = plusHours(o.missingAt, REVEAL_HOURS);
          const canRefundMissing = o.status === "missing" && !!revealDeadline && new Date(revealDeadline).getTime() <= now;
          const canSettleStale = o.status === "disputed" && !o.verdict && hoursSince(o.disputedAt) >= STALE_HOURS;
          const disputedText = sections?.[o.sectionIndex]?.text ?? null;
          // The bond rail finalizes a few seconds before the order row reads "disputed". Until the
          // re-read shows the section index, step 2 says the bond is being recorded and offers nothing.
          const bondRecording = o.status === "paid" && !!bondTx.final && bondTx.final.applied === true && !failureOf(bondTx.final);
          const bondDone = o.status === "disputed" && o.sectionIndex >= 0;
          const judgeDone = o.status === "settled";
          const undelivered = sections ? sections.filter((s) => s.ok !== true) : [];
          const refundLabel = viewer === "buyer" ? "your wallet" : "the buyer's wallet";
          const heading = confetti ? "Thank you!" : `Order ${o.id}`;
          const sub =
            o.status === "paid"
              ? `In escrow · ${countdown(o.deadlineAt, now)}`
              : statusLabel(o.status, o.verdict);

          return (
            <div className="grid min-w-0 gap-8 lg:grid-cols-[400px_1fr]">
              <div className="flex min-w-0 flex-col items-center gap-4 lg:items-start">
                <AnimatedTicket
                  orderId={o.id}
                  amountGen={gen(o.priceAtto)}
                  date={o.openedAt}
                  address={o.buyer}
                  barcodeValue={txHash || o.id}
                  heading={heading}
                  subheading={sub}
                  confetti={confetti}
                  icon={
                    o.status === "settled" && o.verdict === "breaks" ? (
                      <ShieldAlert className="h-10 w-10 text-breaks" />
                    ) : o.status === "refunded" ? (
                      <ShieldAlert className="h-10 w-10 text-breaks" />
                    ) : undefined
                  }
                />
                <div className="w-full max-w-sm space-y-2 rounded-xl border bg-card p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={o.status} verdict={o.verdict} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Pack</span>
                    <Link href={`/pack/${o.listing}`} className="max-w-[60%] truncate text-right text-primary underline-offset-4 hover:underline">
                      {o.title || o.listing}
                    </Link>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Seller</span>
                    <Address value={o.seller} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Dispute window</span>
                    <span className="inline-flex items-center gap-1 text-right">
                      <Clock className="size-3.5" />
                      {o.status === "paid" ? countdown(o.deadlineAt, now) : when(o.deadlineAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Bond to dispute</span>
                    <span>{gen(o.bondRequiredAtto)}</span>
                  </div>
                  {BigInt(o.paidBuyer || "0") > 0n ? (
                    <div className="flex items-center justify-between gap-2 text-keeps">
                      <span>Paid to buyer</span>
                      <span>{gen(o.paidBuyer)}</span>
                    </div>
                  ) : null}
                  {BigInt(o.paidSeller || "0") > 0n ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Paid to seller</span>
                      <span>{gen(o.paidSeller)}</span>
                    </div>
                  ) : null}
                  {txHash ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Purchase tx</span>
                      <TxLink hash={txHash} />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 space-y-8">
                {/* verdict card */}
                {o.status === "settled" && o.verdict ? (
                  <section
                    className={cn(
                      "rounded-2xl border p-5",
                      o.verdict === "breaks" && "border-breaks/50 bg-breaks/10",
                      o.verdict === "keeps" && "border-keeps/50 bg-keeps/10",
                      o.verdict === "unclear" && "border-gold/50 bg-gold/10",
                    )}
                  >
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <Gavel className="size-5" /> Verdict: {o.verdict}
                    </h2>
                    <p className="mt-2 text-sm">{verdictSentence(o, viewer)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Judged {when(o.judgedAt)}. The verdict is final; the same section and promise are never judged twice.
                      {judgeTx.hash ? (
                        <>
                          {" "}
                          <TxLink hash={judgeTx.hash} label="Judge tx" />
                        </>
                      ) : null}
                    </p>
                    {watching ? (
                      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" /> Watching the buyer&apos;s balance: the money lands a few seconds after FINALIZED.
                      </p>
                    ) : landed === "yes" ? (
                      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-keeps">
                        <Check className="size-4" /> Refund landed in {refundLabel}.
                      </p>
                    ) : landed === "timeout" ? (
                      <p className="mt-2 text-xs text-muted-foreground">The buyer&apos;s balance has not moved yet. Check the wallet in a minute; the contract already sent it.</p>
                    ) : null}
                  </section>
                ) : null}

                {o.status === "settled_stale" ? (
                  <section className="rounded-2xl border p-5 text-sm">
                    <h2 className="text-lg font-semibold">Settled by rule</h2>
                    <p className="mt-2 text-muted-foreground">No verdict was stored within {STALE_HOURS} hours of the dispute, so the price went to the seller and the bond back to the buyer.</p>
                  </section>
                ) : null}
                {o.status === "refunded" ? (
                  <section className="rounded-2xl border border-breaks/50 bg-breaks/10 p-5 text-sm">
                    <h2 className="text-lg font-semibold">Refunded</h2>
                    <p className="mt-2">Section {o.missingIndex + 1} was reported missing and the seller did not reveal it within {REVEAL_HOURS} hours. The full price went back to the buyer.</p>
                  </section>
                ) : null}
                {o.status === "released" ? (
                  <section className="rounded-2xl border border-keeps/50 bg-keeps/10 p-5 text-sm">
                    <h2 className="text-lg font-semibold">Released to the seller</h2>
                    <p className="mt-2">The dispute window closed with no dispute, so {gen(o.paidSeller || o.priceAtto)} went to the seller.</p>
                  </section>
                ) : null}

                {/* two-step dispute checklist (in progress or resumable) */}
                {(o.status === "disputed" || bondTx.hash || judgeTx.hash) && o.status !== "settled" ? (
                  <section className="space-y-4 rounded-2xl border border-gold/50 bg-card p-5">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <ShieldAlert className="size-5 text-gold" /> Dispute: section {(o.status === "disputed" ? o.sectionIndex : pick?.section ?? o.sectionIndex) + 1} vs P
                      {(o.status === "disputed" ? o.promiseIndex : pick?.promise ?? o.promiseIndex) + 1}
                    </h2>
                    <ol className="space-y-4 text-sm">
                      <li className="flex gap-3">
                        <StepDot state={bondDone ? "done" : bondTx.hash || bondRecording ? "busy" : "todo"} />
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="font-medium">1. Post the bond ({gen(o.bondRequiredAtto || o.bondAtto)})</p>
                          {bondTx.error ? <p className="text-breaks">{bondTx.error}</p> : null}
                          {bondTx.hash ? <TxRail hash={bondTx.hash} label="Posting the bond" onDone={bondTx.onDone} /> : null}
                          {bondTx.final && failureOf(bondTx.final) ? <p className="text-breaks">{failureOf(bondTx.final)}</p> : null}
                          {bondDone && !bondTx.hash ? <p className="text-muted-foreground">Posted {when(o.disputedAt)}.</p> : null}
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <StepDot state={judgeDone ? "done" : judgeTx.hash && !judgeTx.final ? "busy" : "todo"} />
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="font-medium">2. Ask the validators</p>
                          <p className="text-xs text-muted-foreground">The section text is sent on chain. It must hash to what the seller committed, or the contract refuses it. Anyone may send this step.</p>
                          {bondRecording ? (
                            <p className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" /> Recording the bond… the order row is re-read until it says disputed.
                            </p>
                          ) : null}
                          {bondDone && !judgeDone ? (
                            <>
                              {disputedText === null ? (
                                <div className="space-y-2">
                                  <p className="text-xs text-muted-foreground">Load the pack above with your signature, or paste the exact section text here.</p>
                                  <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} className="font-mono text-xs" placeholder="Paste the exact text of the disputed section" />
                                </div>
                              ) : null}
                              <WalletGate action="ask the validators">
                                <Button
                                  type="button"
                                  variant="cool"
                                  disabled={judgeTx.sending || (!!judgeTx.hash && !judgeTx.final) || (disputedText === null && !pasted.trim())}
                                  onClick={() => void startJudge(o, disputedText ?? pasted)}
                                >
                                  {judgeTx.final && failureOf(judgeTx.final) ? "Try again" : "Ask the validators"}
                                </Button>
                              </WalletGate>
                            </>
                          ) : null}
                          {judgeTx.error ? <p className="text-breaks">{judgeTx.error}</p> : null}
                          {judgeTx.hash ? <TxRail hash={judgeTx.hash} label="Validators are reading the section" onDone={judgeTx.onDone} showVotes /> : null}
                          {judgeTx.final && failureOf(judgeTx.final) ? <p className="text-breaks">{failureOf(judgeTx.final)}</p> : null}
                        </div>
                      </li>
                    </ol>
                    {canSettleStale ? (
                      <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                        <p>No verdict for {STALE_HOURS} hours. Anyone may settle by rule: price to the seller, bond back to the buyer.</p>
                        <WalletGate action="settle">
                          <Button type="button" size="sm" variant="outline" className="mt-2" disabled={ruleTx.sending || (!!ruleTx.hash && !ruleTx.final)} onClick={() => void ruleTx.start("settle_stale", [o.id])}>
                            Settle by rule
                          </Button>
                        </WalletGate>
                        {ruleTx.error ? <p className="mt-1 text-breaks">{ruleTx.error}</p> : null}
                        {ruleTx.hash ? <TxRail hash={ruleTx.hash} label="Settling by rule" onDone={ruleTx.onDone} className="mt-2" /> : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {/* missing section flow */}
                {o.status === "missing" ? (
                  <section className="space-y-3 rounded-2xl border border-gold/50 bg-card p-5 text-sm">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <FileQuestion className="size-5 text-gold" /> Section {o.missingIndex + 1} reported missing
                    </h2>
                    <p className="text-muted-foreground">
                      Reported {when(o.missingAt)}. The seller has until {when(revealDeadline)} ({countdown(revealDeadline, now)}) to reveal the exact text of section {o.missingIndex + 1} on chain. If they do not, anyone can trigger a full refund of {gen(o.priceAtto)} to the buyer; no model is asked.
                    </p>
                    {isSeller ? (
                      <div className="space-y-2">
                        <p className="font-medium">You are the seller. Paste the exact text of section {o.missingIndex + 1}:</p>
                        <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} className="font-mono text-xs" />
                        <WalletGate action="reveal">
                          <Button type="button" variant="cool" disabled={!pasted.trim() || revealTx.sending || (!!revealTx.hash && !revealTx.final)} onClick={() => void revealTx.start("reveal", [o.id, pasted])}>
                            Reveal on chain
                          </Button>
                        </WalletGate>
                        {revealTx.error ? <p className="text-breaks">{revealTx.error}</p> : null}
                        {revealTx.hash ? <TxRail hash={revealTx.hash} label="Revealing the section" onDone={revealTx.onDone} /> : null}
                        {revealTx.final && failureOf(revealTx.final) ? <p className="text-breaks">{failureOf(revealTx.final)}</p> : null}
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <WalletGate action="refund">
                        <Button
                          type="button"
                          variant="cool"
                          disabled={!canRefundMissing || ruleTx.sending || (!!ruleTx.hash && !ruleTx.final)}
                          title={canRefundMissing ? undefined : `Opens ${when(revealDeadline)}`}
                          onClick={() => void ruleTx.start("refund_missing", [o.id])}
                        >
                          Full refund ({gen(o.priceAtto)} to the buyer)
                        </Button>
                      </WalletGate>
                      <p className="text-xs text-muted-foreground">
                        {canRefundMissing
                          ? "The reveal window closed with no reveal. Anyone may send this; the contract checks the clock, not the caller."
                          : `Anyone may send this once the reveal window closes, ${when(revealDeadline)}.`}
                      </p>
                      {ruleTx.error ? <p className="text-breaks">{ruleTx.error}</p> : null}
                      {ruleTx.hash ? <TxRail hash={ruleTx.hash} label="Refunding the buyer" onDone={ruleTx.onDone} /> : null}
                      {ruleTx.final && failureOf(ruleTx.final) ? <p className="text-breaks">{failureOf(ruleTx.final)}</p> : null}
                    </div>
                  </section>
                ) : null}

                {/* a section was reported missing and the seller revealed it: the order is back in escrow */}
                {o.status === "paid" && o.missingAt && o.revealedText ? (
                  <section className="space-y-2 rounded-2xl border bg-card p-5 text-sm">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <FileQuestion className="size-5 text-gold" /> Section {o.missingIndex + 1} was revealed on chain
                    </h2>
                    <p className="text-muted-foreground">
                      It was reported missing {when(o.missingAt)}; the seller then revealed its exact text, which hashed to what they committed. The order is back in escrow and the dispute window runs to {when(o.deadlineAt)}.
                    </p>
                    <pre className="max-h-60 overflow-auto rounded-lg border bg-muted/30 px-3 py-2 font-sans text-xs leading-relaxed whitespace-pre-wrap break-words">{o.revealedText}</pre>
                  </section>
                ) : null}

                {/* release */}
                {canRelease ? (
                  <section className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
                    <h2 className="text-lg font-semibold">The window closed with no dispute</h2>
                    <p className="text-muted-foreground">Anyone may release the price to the seller now.</p>
                    <WalletGate action="release">
                      <Button type="button" variant="cool" disabled={releaseTx.sending || (!!releaseTx.hash && !releaseTx.final)} onClick={() => void releaseTx.start("release", [o.id])}>
                        Release {gen(o.priceAtto)} to seller
                      </Button>
                    </WalletGate>
                    {releaseTx.error ? <p className="text-breaks">{releaseTx.error}</p> : null}
                    {releaseTx.hash ? <TxRail hash={releaseTx.hash} label="Releasing to the seller" onDone={releaseTx.onDone} /> : null}
                    {releaseTx.final && failureOf(releaseTx.final) ? <p className="text-breaks">{failureOf(releaseTx.final)}</p> : null}
                  </section>
                ) : null}

                {/* the pack */}
                <section className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">The pack</h2>
                      <p className="text-sm text-muted-foreground">
                        {l ? `${l.sectionCount} sections, ${l.promises.length} promises.` : "Listing details did not load."} Every section is hashed here and compared with the chain.
                      </p>
                    </div>
                    {sections ? (
                      <span className="text-xs text-muted-foreground">
                        {sections.filter((s) => s.ok).length}/{sections.length} match the committed hashes
                      </span>
                    ) : null}
                  </div>

                  {l ? <PromisePills promises={l.promises} highlight={o.status !== "paid" && o.promiseIndex >= 0 ? o.promiseIndex : undefined} /> : null}

                  {/* the model-free way out of an undelivered or altered pack */}
                  {sections && undelivered.length > 0 && o.status === "paid" ? (
                    <div className="space-y-1 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm">
                      <p className="font-medium">
                        {undelivered.length === sections.length ? "The seller has not delivered this pack." : `${undelivered.length} of ${sections.length} sections did not arrive as committed.`}
                      </p>
                      <p className="text-muted-foreground">
                        Report a missing section: the seller then has {REVEAL_HOURS} hours to reveal its text on chain, and if they do not, anyone can trigger a full refund. No model is asked; the contract only checks the clock and the hash.
                      </p>
                      {packError ? <p className="text-xs text-muted-foreground">The delivery store said: {packError}</p> : null}
                      {!windowOpen ? <p className="text-xs text-muted-foreground">The dispute window has closed, so a report is no longer possible.</p> : !isBuyer ? <p className="text-xs text-muted-foreground">Only the buyer can report a section.</p> : null}
                    </div>
                  ) : null}

                  {!sections ? (
                    <div className="rounded-xl border border-dashed bg-card p-4 text-sm">
                      {!l ? (
                        <p className="text-muted-foreground">The listing did not load, so the hashes cannot be checked yet. Retry above.</p>
                      ) : isMock ? (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" /> Loading the pack…
                        </p>
                      ) : !w.address ? (
                        <WalletGate action="read your pack">{null}</WalletGate>
                      ) : !isBuyer ? (
                        <p className="text-muted-foreground">
                          This order belongs to <span className="font-mono">{o.buyer}</span>. Connect that wallet to read the pack.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p>Sign one message to read your pack. The signature only proves you are the buyer; it is cached in this browser for this order.</p>
                          <WalletGate action="read your pack">
                            <Button type="button" variant="cool" disabled={packBusy} onClick={() => void loadPack(o, l)}>
                              {packBusy ? <Loader2 className="animate-spin" /> : null} Sign to read the pack
                            </Button>
                          </WalletGate>
                          {packError ? <p className="text-sm text-breaks">{packError}</p> : null}
                        </div>
                      )}
                      {isMock && packError ? <p className="text-sm text-breaks">{packError}</p> : null}
                    </div>
                  ) : (
                    <ol className="space-y-3">
                      {sections.map((s) => (
                        <li
                          key={s.index}
                          className={cn(
                            "rounded-xl border bg-card",
                            o.sectionIndex === s.index && o.status !== "paid" && "border-gold/60",
                            o.status === "missing" && o.missingIndex === s.index && "border-gold/60",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                            <span className="font-medium">Section {s.index + 1}</span>
                            {o.status === "missing" && o.missingIndex === s.index ? (
                              <span className="inline-flex items-center gap-1 text-xs text-gold">
                                <FileQuestion className="size-3.5" /> reported missing, the seller has until {when(revealDeadline)}
                              </span>
                            ) : s.ok === true ? (
                              <span className="inline-flex items-center gap-1 text-xs text-keeps">
                                <Check className="size-3.5" /> matches hash
                              </span>
                            ) : s.ok === false ? (
                              <span className="inline-flex items-center gap-1 text-xs text-breaks">
                                <X className="size-3.5" /> does not match the committed hash
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-gold">
                                <AlertTriangle className="size-3.5" /> not delivered
                              </span>
                            )}
                          </div>
                          {s.text !== null ? (
                            <pre className="max-h-80 overflow-auto px-4 py-3 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words">{s.text}</pre>
                          ) : (
                            <p className="px-4 py-3 text-sm text-muted-foreground">The delivery store returned nothing for this section.</p>
                          )}
                          {windowOpen && isBuyer ? (
                            <div className="flex flex-wrap gap-2 border-t px-4 py-2">
                              {s.ok === true ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => setDialogSection(s.index)} disabled={bondTx.sending || (!!bondTx.hash && !bondTx.final)}>
                                  <ShieldAlert /> This breaks a promise
                                </Button>
                              ) : null}
                              {s.ok !== true ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void missingTx.start("report_missing", [o.id, String(s.index)])}
                                  disabled={missingTx.sending || (!!missingTx.hash && !missingTx.final) || (!!missingTx.final && missingTx.final.applied === true && !failureOf(missingTx.final))}
                                >
                                  <FileQuestion /> Section missing? Report it
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}

                  {missingTx.error ? <p className="text-sm text-breaks">{missingTx.error}</p> : null}
                  {missingTx.hash ? <TxRail hash={missingTx.hash} label="Reporting the section missing" onDone={missingTx.onDone} /> : null}
                  {missingTx.final && failureOf(missingTx.final) ? <p className="text-sm text-breaks">{failureOf(missingTx.final)}</p> : null}
                  {o.status === "paid" && missingTx.final && missingTx.final.applied === true && !failureOf(missingTx.final) ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Recording the report… the order row is re-read until it says missing.
                    </p>
                  ) : null}

                  {windowOpen && isBuyer && sections ? (
                    <p className="text-xs text-muted-foreground">
                      Window: {windowLabel(l?.windowSeconds ?? 0)} from purchase, {countdown(o.deadlineAt, now)}. A dispute posts a {gen(o.bondRequiredAtto)} bond that comes back if the validators agree with you.
                    </p>
                  ) : null}
                </section>
              </div>

              {/* pick a promise */}
              <Dialog open={dialogSection !== null} onOpenChange={(open) => !open && setDialogSection(null)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Section {(dialogSection ?? 0) + 1} breaks which promise?</DialogTitle>
                    <DialogDescription>
                      Pick one. You post {gen(o.bondRequiredAtto)} as a bond, then the validators read the section against that promise. If they agree with you, price and bond come back; if not, both go to the seller.
                    </DialogDescription>
                  </DialogHeader>
                  {l ? (
                    <ol className="space-y-2">
                      {l.promises.map((p, i) => (
                        <li key={i}>
                          <WalletGate action="post the bond">
                            <button
                              type="button"
                              className="flex w-full items-start gap-3 rounded-xl border bg-card px-3 py-2 text-left text-sm hover:border-gold/60 hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => {
                                const section = dialogSection ?? 0;
                                setDialogSection(null);
                                void startBond(o, section, i);
                              }}
                            >
                              <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-gold/15 px-2 font-mono text-[11px] font-semibold text-gold">P{i + 1}</span>
                              <span>{p}</span>
                            </button>
                          </WalletGate>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <DialogFooter showCloseButton />
                </DialogContent>
              </Dialog>
            </div>
          );
        }}
      </ReadBlock>
    </div>
  );
}

function StepDot({ state }: { state: "todo" | "busy" | "done" }) {
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
        state === "done" && "border-keeps bg-keeps/15 text-keeps",
        state === "busy" && "border-primary text-primary",
        state === "todo" && "text-muted-foreground",
      )}
    >
      {state === "done" ? <Check className="size-3.5" /> : state === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : <Circle className="size-2 fill-current opacity-40" />}
    </span>
  );
}

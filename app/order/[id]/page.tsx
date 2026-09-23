"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Circle, Clock, FileQuestion, Gavel, Link2, ListChecks, Loader2, RefreshCw, ShieldAlert, Undo2, X } from "lucide-react";

import { Address, TxLink } from "@/components/address";
import { PromisePills } from "@/components/promise-pills";
import { BlockSkeleton, ReadBlock } from "@/components/read-state";
import { StatusBadge } from "@/components/status-badge";
import { TxRail } from "@/components/tx-rail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedTicket } from "@/components/ui/ticket-confirmation-card";
import { useRead, useSearchString } from "@/components/use-read";
import { cleanWalletError, failureOf, useTx, type TxRun } from "@/components/use-tx";
import { useWallet } from "@/components/wallet";
import { WalletGate } from "@/components/wallet-gate";
import {
  balanceOf,
  chainTime,
  contractAddress,
  isMock,
  parseChainTime,
  readListing,
  readOrder,
  type Listing,
  type Order,
  type OrderStatus,
  type TxStatus,
  type WriteFn,
} from "@/lib/chain";
import { fetchPack, issuedIsFresh, issuedNow, readMessage, sha256Hex } from "@/lib/api";
import { mockPackSections } from "@/lib/chain-mock";
import { demoKeys } from "@/lib/demo-keys";
import { DEMO_PACKS } from "@/lib/demo-packs";
import { countdown, gen, statusLabel, when, windowLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const REVEAL_HOURS = 24;
const STALE_HOURS = 24;
/** The contract's cap on one section. A committed section over it is settled "breaks" by rule, with no model asked. */
const MAX_SECTION_CHARS = 4000;
/** The contract's per-order cap on missing reports; the page only says what the order row confirms. */
const MAX_MISSING_REPORTS = 3;
/** After an applied write the order row is re-read this often, this many times, until its status moves. */
const AWAIT_MS = 3000;
const AWAIT_TRIES = 20;
/** ?tx= is only shown when it is a transaction hash. */
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * `fresh` drops the cached order row first, so a re-read after a write reaches the network.
 *
 * The order row is what this page is about; the listing is a second gen_call that only fills in
 * the promises and the hashes. It is read but never allowed to fail the page: a settled order's
 * verdict, the contract's sentence and the judged text need no listing, and every block that does
 * need one already says so and offers a re-read.
 */
async function readOrderPage(id: string, fresh = false) {
  const o = await readOrder(id, undefined, { fresh });
  if (!o.data) return { data: null, source: o.source } as const;
  const l = await readListing(o.data.listing).catch(() => ({ data: null, source: o.source }) as const);
  const source = o.source === "snapshot" || l.source === "snapshot" ? "snapshot" : "chain";
  return { data: { order: o.data, listing: l.data }, source } as const;
}

/** `onChain`: the text came from the order row (a seller's reveal or the judged text), not the delivery store. */
type SectionRow = { index: number; text: string | null; ok: boolean | null; onChain?: boolean };

/** A section whose text is public on chain: revealed by the seller, or sent with judge(). `ok` once it hashed to the commitment. */
type OnChainSection = { index: number; text: string; kind: "revealed" | "judged"; ok: boolean };

/** Who is looking at the page: the buyer, the seller, or anyone else (a visitor, no wallet). */
type Viewer = "buyer" | "seller" | "other";

/** The pack store answered that there is nothing to serve; the section list is still shown, every row "not delivered". */
const isUndeliveredReason = (reason: string) => /not uploaded|could not be opened/i.test(reason);

/** The read-pack signature is cached per register, per signer and per order, so it is never sent for another. */
const sigKey = (register: string, address: string, orderId: string) => `ad:sig:${register.toLowerCase()}:${address.toLowerCase()}:${orderId}`;

/** What is cached under that key: the signature and the minute it was signed for. */
type CachedSig = { s: string; i: string };

/** The cached signature for this order, or null when there is none, it is unreadable, or it expired. */
function cachedSig(key: string): CachedSig | null {
  let raw = "";
  try {
    raw = localStorage.getItem(key) ?? "";
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CachedSig>;
    if (typeof v?.s !== "string" || !v.s || !issuedIsFresh(v.i)) return null;
    return { s: v.s, i: v.i as string };
  } catch {
    return null; // an older cache entry held the signature alone, with no time in it
  }
}

/** Characters as the contract counts them (code points), for the section cap. */
const charCount = (text: string) => Array.from(text).length;

/**
 * Every section text the order row makes public: each reveal (on an older register, mapOrder recovers
 * the last one from revealed_text) and, once judged, the judged text. Every candidate is hash-checked
 * before it is shown as a section.
 */
function onChainCandidates(o: Order): Omit<OnChainSection, "ok">[] {
  const out: Omit<OnChainSection, "ok">[] = [];
  for (const r of o.revealed ?? []) {
    if (r && typeof r.text === "string" && r.text && Number.isInteger(r.index) && r.index >= 0) out.push({ index: r.index, text: r.text, kind: "revealed" });
  }
  if (o.revealedText && o.verdict && o.sectionIndex >= 0) out.push({ index: o.sectionIndex, text: o.revealedText, kind: "judged" });
  return out;
}

/**
 * A chain instant plus `hours`, as an ISO string every browser reads ("" when unreadable), for the
 * deadline checks, when() and countdown(). The contract writes six-digit fractions.
 */
function chainIso(iso: string, hours = 0): string {
  const t = parseChainTime(iso);
  return Number.isFinite(t) ? new Date(t + hours * 3600000).toISOString() : "";
}

/**
 * The bond the buyer posted with the dispute. The order view says bond_required "0" once the order
 * is not paid, and the contract zeroes `bond` when it pays out, so a settled order's bond is read
 * back from the payouts: breaks paid price + bond to the buyer, keeps paid it to the seller, and
 * unclear or a settlement by rule returned the bond alone.
 */
function postedBond(o: Order): bigint {
  const held = BigInt(o.bondAtto || "0");
  if (held > 0n) return held;
  const price = BigInt(o.priceAtto || "0");
  const toBuyer = BigInt(o.paidBuyer || "0");
  const toSeller = BigInt(o.paidSeller || "0");
  if (o.status === "settled_stale") return toBuyer;
  if (o.status !== "settled") return 0n;
  if (o.verdict === "breaks") return toBuyer > price ? toBuyer - price : 0n;
  if (o.verdict === "keeps") return toSeller > price ? toSeller - price : 0n;
  return toBuyer;
}

/**
 * The verdict sentence, written by the site from the closed set. Shown only when the order row has no
 * verdict_line of its own (a register deployed before the contract wrote one). Nothing the model wrote
 * is shown. Amounts come from paid_buyer / paid_seller once the order is settled (the contract zeroes
 * the bond at settlement, so price + bond is only right before it), and the sentence is written for the viewer.
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
    const why =
      o.revealedText && charCount(o.revealedText) > MAX_SECTION_CHARS
        ? `Section ${s} is longer than the ${MAX_SECTION_CHARS}-character cap, so the contract settled it as breaking promise ${p} by rule, without asking the validators.`
        : `The validators agreed: section ${s} breaks promise ${p}.`;
    return `${why} ${toBuyer} ${who}.`;
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
    return `The validators did not reach a clear answer on whether section ${s} breaks promise ${p}. ${who}`;
  }
  return "";
}

/** A write reached FINALIZED and the contract applied it (not refused, not split). */
const landedOk = (t: TxRun) => !!t.final && t.final.applied === true && !failureOf(t.final);

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const w = useWallet();
  // A write that was applied changes the order's status, but the node answers the next read
  // with the old row for a few seconds. After such a write the page re-reads the row every 3 s,
  // past the view cache, until the status it was sent from is gone (or 20 tries passed). Until
  // then every write button stays disabled, so nothing is drawn or sent against a stale row.
  const [awaitFrom, setAwaitFrom] = React.useState<OrderStatus | null>(null);
  const awaitFromRef = React.useRef<OrderStatus | null>(null);
  // The next read skips the view cache when this is set (see rereadRef below).
  const freshNext = React.useRef(false);
  const page = useRead(async () => {
    const fresh = freshNext.current;
    freshNext.current = false;
    const r = await readOrderPage(id, fresh);
    // The row moved on: stop waiting, so a later change made by the other party never re-locks the page.
    if (awaitFromRef.current && r.data && r.data.order.status !== awaitFromRef.current) {
      awaitFromRef.current = null;
      setAwaitFrom(null);
    }
    return r;
  }, [id]);

  // ?tx=…&new=1 → barcode and a one-time confetti (once per order per browser). Anyone can put
  // anything in a link, so a value that is not a transaction hash is dropped.
  const search = useSearchString();
  const txHash = React.useMemo(() => {
    const raw = new URLSearchParams(search).get("tx") ?? "";
    return TX_HASH_RE.test(raw) ? raw : "";
  }, [search]);
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

  // a clock for countdowns (moved onto the chain's clock per order with chainTime)
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- the pack: one personal_sign, cached per register, signer and order ----
  const [sections, setSections] = React.useState<SectionRow[] | null>(null);
  const [packError, setPackError] = React.useState("");
  const [packBusy, setPackBusy] = React.useState(false);
  const order = page.data?.order ?? null;
  const listing = page.data?.listing ?? null;

  // The checklist's "Demo pack" box: when the listing's hashes are exactly one of the demo packs',
  // that pack's hint is shown (it never names the section or the ingredient).
  const [demoHint, setDemoHint] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!listing || !listing.hashes.length) return;
    let alive = true;
    const key = listing.hashes.map((h) => h.toLowerCase()).join(",");
    demoKeys()
      .then((keys) => {
        if (!alive) return;
        const i = keys.indexOf(key);
        setDemoHint(i >= 0 ? DEMO_PACKS[i].hint : null);
      })
      .catch(() => {
        if (alive) setDemoHint(null);
      });
    return () => {
      alive = false;
    };
  }, [listing]);

  // ---- sections that are public on chain: hash-checked against the commitment on every re-read ----
  const candidates = React.useMemo(() => (order ? onChainCandidates(order) : []), [order]);
  const candKey =
    order && listing ? JSON.stringify([order.id, listing.hashes, candidates]) : "";
  const [verified, setVerified] = React.useState<{ key: string; rows: OnChainSection[] }>({ key: "", rows: [] });
  React.useEffect(() => {
    // with no candidates the render reads nothing from `verified`, so there is nothing to store
    if (!candKey || !listing || candidates.length === 0) return;
    let alive = true;
    void (async () => {
      const rows: OnChainSection[] = [];
      for (const c of candidates) {
        const committed = listing.hashes[c.index];
        rows.push({ ...c, ok: !!committed && (await sha256Hex(c.text)) === committed.toLowerCase() });
      }
      if (alive) setVerified({ key: candKey, rows });
    })();
    return () => {
      alive = false;
    };
  }, [candKey, candidates, listing]);
  const onChain = verified.key === candKey ? verified.rows.filter((r) => r.ok) : [];
  const onChainAt = (index: number) => onChain.find((r) => r.index === index) ?? null;

  // The delivery store's rows, with every section that is on chain and matches its hash filled in:
  // a revealed section can then be read and disputed like a delivered one.
  const rows: SectionRow[] | null = sections
    ? sections.map((s) => {
        const c = s.ok === true ? null : onChainAt(s.index);
        return c ? { index: s.index, text: c.text, ok: true, onChain: true } : s;
      })
    : null;

  const verify = React.useCallback(async (texts: string[], hashes: string[]) => {
    const out: SectionRow[] = [];
    for (let i = 0; i < hashes.length; i++) {
      const text = texts[i] ?? null;
      out.push({ index: i, text, ok: text === null ? null : (await sha256Hex(text)) === hashes[i] });
    }
    setSections(out);
  }, []);

  const loadPack = React.useCallback(
    async (o: Order, l: Listing, sig?: CachedSig) => {
      setPackBusy(true);
      setPackError("");
      const key = sigKey(contractAddress(), w.address, o.id);
      try {
        if (isMock) {
          const texts = mockPackSections(o.listing) ?? [];
          await verify(texts, l.hashes);
          return;
        }
        let signed = sig;
        if (!signed) {
          const issued = issuedNow();
          signed = { s: await w.signMessage(readMessage(o.id, o.listing, issued)), i: issued };
          try {
            localStorage.setItem(key, JSON.stringify(signed));
          } catch {}
        }
        const r = await fetchPack(o.listing, o.id, w.address, signed.s, signed.i);
        if (!r.ok || !r.sections) {
          const reason = r.reason || "The delivery store refused the request.";
          // Nothing stored for this listing: the signature was fine, so keep it, and show the
          // section list from the committed hashes with every row "not delivered".
          if (isUndeliveredReason(reason)) {
            await verify([], l.hashes);
            setPackError(reason);
            return;
          }
          // Only 401, the route's answer about the signature itself, retires the stored one. A
          // store or a network that did not answer says nothing about it, and a buyer who already
          // signed should not have to sign again to try the same read.
          if (sig && r.status === 401) {
            try {
              localStorage.removeItem(key);
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
      try {
        // the old key named only the order, so it could hand one wallet's signature to another
        localStorage.removeItem(`ad:sig:${order.id}`);
      } catch {}
      const cached = w.address ? cachedSig(sigKey(contractAddress(), w.address, order.id)) : null;
      if (cached && w.address && w.address.toLowerCase() === order.buyer.toLowerCase()) void loadPack(order, listing, cached);
      else autoTried.current = "";
    }, 0);
    return () => clearTimeout(t);
  }, [order, listing, sections, loadPack, w.address]);

  // ---- dispute: pick a promise, post the bond, ask the validators ----
  const [pick, setPick] = React.useState<{ section: number; promise: number } | null>(null);
  const [dialogSection, setDialogSection] = React.useState<number | null>(null);
  const [dialogPromise, setDialogPromise] = React.useState<number | null>(null);
  const [pasted, setPasted] = React.useState("");
  const [balanceBefore, setBalanceBefore] = React.useState<bigint | null>(null);
  const [landed, setLanded] = React.useState<null | "yes" | "timeout">(null);

  const openDialog = (section: number) => {
    setDialogPromise(null);
    setDialogSection(section);
  };

  // ---- after a write: re-read until the order row shows it (state declared at the top) ----
  const [awaitTry, setAwaitTry] = React.useState(0);
  const sentFrom = React.useRef<OrderStatus | null>(null);
  const rereadRef = React.useRef<() => Promise<void>>(async () => {});
  React.useEffect(() => {
    rereadRef.current = () => {
      freshNext.current = true;
      return page.refresh();
    };
  });
  const applied = (s: TxStatus) => {
    if (!s.applied || failureOf(s)) return;
    const from = sentFrom.current ?? order?.status ?? null;
    awaitFromRef.current = from;
    setAwaitTry(0);
    setAwaitFrom(from);
    void rereadRef.current();
  };
  const stillOld = !!awaitFrom && !!order && order.status === awaitFrom;
  const rereadGaveUp = stillOld && awaitTry >= AWAIT_TRIES;
  React.useEffect(() => {
    if (!stillOld || awaitTry >= AWAIT_TRIES) return;
    const t = setTimeout(() => {
      setAwaitTry((n) => n + 1);
      void rereadRef.current();
    }, AWAIT_MS);
    return () => clearTimeout(t);
  }, [stillOld, awaitTry, order]);
  const rereadNow = () => {
    setAwaitTry(0);
    void rereadRef.current();
  };

  const bondTx = useTx(applied);
  const judgeTx = useTx(applied);
  const releaseTx = useTx(applied);
  const missingTx = useTx(applied);
  const revealTx = useTx(applied);
  const ruleTx = useTx(applied);
  const withdrawTx = useTx(applied);

  /** Every write goes through here, so the re-read loop knows which status the write was sent from. */
  const send = (tx: TxRun, o: Order, fn: WriteFn, args: string[], valueAtto?: bigint) => {
    sentFrom.current = o.status;
    return tx.start(fn, args, valueAtto);
  };

  const startBond = async (o: Order, section: number, promise: number) => {
    setPick({ section, promise });
    judgeTx.reset();
    setLanded(null);
    await send(bondTx, o, "open_dispute", [o.id, String(section), String(promise)], BigInt(o.bondRequiredAtto));
  };

  const startJudge = async (o: Order, text: string) => {
    setLanded(null);
    try {
      setBalanceBefore(await balanceOf(o.buyer));
    } catch {
      setBalanceBefore(null);
    }
    await send(judgeTx, o, "judge", [o.id, text]);
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
          // Every deadline is compared with the chain's clock, carried forward from the read, not
          // with this browser's clock: a fast or slow clock would offer calls the contract refuses.
          const chainNowMs = chainTime(o, now);
          const cnow = Number.isFinite(chainNowMs) ? chainNowMs : now;
          const deadline = chainIso(o.deadlineAt);
          const deadlinePassed = !!deadline && Date.parse(deadline) <= cnow;
          const windowOpen = o.status === "paid" && !deadlinePassed;
          const canRelease = o.status === "paid" && deadlinePassed;
          const revealDeadline = chainIso(o.missingAt, REVEAL_HOURS);
          const canRefundMissing = o.status === "missing" && !!revealDeadline && Date.parse(revealDeadline) <= cnow;
          const staleAt = chainIso(o.disputedAt, STALE_HOURS);
          const canSettleStale = o.status === "disputed" && !o.verdict && !!staleAt && Date.parse(staleAt) <= cnow;
          const disputedRow = rows?.[o.sectionIndex];
          const disputedText = (disputedRow?.ok === true ? disputedRow.text : null) ?? onChainAt(o.sectionIndex)?.text ?? null;
          // The bond rail finalizes a few seconds before the order row reads "disputed". Until the
          // re-read shows the section index, step 2 says the bond is being recorded and offers nothing.
          const bondRecording = o.status === "paid" && landedOk(bondTx);
          const bondDone = o.status === "disputed" && o.sectionIndex >= 0;
          const judgeDone = o.status === "settled";
          const undelivered = rows ? rows.filter((s) => s.ok !== true) : [];
          const judged = o.status === "settled" && !!o.verdict && !!o.revealedText;
          // A section the buyer reported missing, the seller revealed and the buyer then disputed
          // has a reveal row and a judged row for the same index and the same bytes. The verdict
          // card prints it, so the reveal card below must not print it a second time.
          const revealedOnChain = onChain
            .filter((r) => r.kind === "revealed" && !(judged && r.index === o.sectionIndex))
            .sort((a, b) => a.index - b.index);
          const judgedOk = judged && onChain.some((r) => r.kind === "judged" && r.index === o.sectionIndex);
          const overCap = judged && charCount(o.revealedText) > MAX_SECTION_CHARS;
          // null on a register that does not publish the counter: the page then says nothing about
          // a cap it cannot read, and leaves the contract to refuse a report it will not accept.
          const reportsLeft = o.missingReportsLeft;
          const refundLabel = viewer === "buyer" ? "your wallet" : "the buyer's wallet";
          const you = viewer === "buyer" ? "you" : "the buyer";
          const your = viewer === "buyer" ? "your" : "the buyer's";
          const heading = confetti ? "Thank you!" : `Order ${o.id}`;
          const sub =
            o.status === "paid"
              ? `In escrow · ${countdown(deadline, cnow)}`
              : statusLabel(o.status, o.verdict);

          // ---- the guided checklist: where the viewer is, and what to do next ----
          // bond_required reads "0" once the order is not paid, so a disputed order shows the bond it holds.
          const bondShown = o.status === "paid" ? BigInt(o.bondRequiredAtto || "0") : postedBond(o);
          const bond = gen(bondShown);
          const settled = o.status === "settled" || o.status === "settled_stale";
          const bondFailed = bondTx.final ? failureOf(bondTx.final) : "";
          const disputeExists = o.status !== "paid" || (!!pick && !bondTx.error && !bondFailed);
          const bondBusy = (!!bondTx.hash && !bondTx.final) || bondRecording;
          const judgeBusy = !!judgeTx.hash && !judgeTx.final;
          const s1: StepState = sections ? "done" : "active";
          const s2: StepState = disputeExists ? "done" : sections ? "active" : "todo";
          const s3: StepState = bondDone || settled ? "done" : !disputeExists ? "todo" : bondBusy ? "busy" : "active";
          const s4: StepState = settled ? "done" : !bondDone ? "todo" : judgeBusy ? "busy" : "active";
          const s5: StepState = settled ? "done" : "todo";
          const pickedSection = (o.status === "disputed" ? o.sectionIndex : (pick?.section ?? o.sectionIndex)) + 1;
          const pickedPromise = (o.status === "disputed" ? o.promiseIndex : (pick?.promise ?? o.promiseIndex)) + 1;
          const summary =
            o.status === "settled" && o.verdict
              ? `Settled: section ${o.sectionIndex + 1} vs P${o.promiseIndex + 1}, verdict ${o.verdict}. One dispute per order, and this one is used.`
              : o.status === "settled_stale"
                ? `Settled by rule: no verdict within ${STALE_HOURS} hours, so the price went to the seller and the bond back to the buyer.`
                : o.status === "released"
                  ? "Released: the window closed with no dispute and the price went to the seller."
                  : o.status === "refunded"
                    ? `Refunded: section ${o.missingIndex + 1} was never revealed, so the full price went back to the buyer.`
                    : o.status === "missing"
                      ? `Section ${o.missingIndex + 1} is reported missing. The seller's reveal window is running; the box below has the next step.`
                      : o.status === "paid" && deadlinePassed
                        ? "The dispute window has closed. Nothing can be disputed now; anyone may release the price to the seller below."
                        : viewer === "seller" && o.status === "paid"
                          ? `You are the seller. The buyer has until ${when(deadline)} to dispute one section; after that anyone may release the price to you.`
                          : "";
          const checklist = summary ? (
            <section className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm">
              <ListChecks className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p>{summary}</p>
            </section>
          ) : (
            <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ListChecks className="size-5" /> What to do next
                </h2>
                <p className="text-sm text-muted-foreground">Five steps from purchase to verdict. The highlighted step is where you are.</p>
              </div>
              <ol className="space-y-2 text-sm">
                <GuideStep n={1} state={s1} title="Read your pack">
                  {s1 === "active" ? (
                    isMock ? (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Loading the pack…
                      </p>
                    ) : !w.address ? (
                      <>
                        <p className="text-muted-foreground">Connect the wallet you bought with, then sign one message. The signature only proves you are the buyer.</p>
                        <WalletGate action="read your pack">{null}</WalletGate>
                      </>
                    ) : !isBuyer ? (
                      <p className="text-muted-foreground">
                        This order belongs to <span className="font-mono break-all">{o.buyer}</span>. Connect that wallet to read the pack.
                      </p>
                    ) : (
                      <>
                        <p className="text-muted-foreground">Sign one message; every section is then fetched and checked against what the seller committed before the sale.</p>
                        {l ? (
                          <Button type="button" size="sm" variant="cool" disabled={packBusy} onClick={() => void loadPack(o, l)}>
                            {packBusy ? <Loader2 className="animate-spin" /> : null} Sign to read the pack
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-muted-foreground">The listing did not load, so the pack cannot be checked yet.</p>
                            <Button type="button" size="sm" variant="outline" onClick={rereadNow}>
                              <RefreshCw /> Read the listing again
                            </Button>
                          </div>
                        )}
                        {packError ? <p className="text-breaks">{packError}</p> : null}
                      </>
                    )
                  ) : s1 === "done" && rows ? (
                    <p className="text-muted-foreground">
                      {rows.length} sections loaded, {rows.filter((x) => x.ok).length} delivered as committed.
                    </p>
                  ) : null}
                </GuideStep>
                <GuideStep n={2} state={s2} title="Find the section that breaks a promise">
                  {s2 === "active" ? (
                    <>
                      <p>
                        A green tick only means the text is exactly what the seller committed. It says nothing about the promises. Read the sections against the promises and pick the one that breaks one.
                      </p>
                      <p>
                        You get <strong>one dispute per order</strong>, so choose carefully. A dispute posts a bond of <strong>{bond}</strong>, and the verdict decides where the money goes:
                      </p>
                      <OutcomeList you="you" your="your" />
                      {undelivered.length > 0 ? (
                        <p className="text-muted-foreground">
                          {undelivered.length} of {rows?.length ?? 0} sections did not arrive as committed. For those, report the section missing instead; that path needs no bond.
                        </p>
                      ) : null}
                      {bondTx.error || bondFailed ? <p className="text-breaks">The bond did not go through: {bondTx.error || bondFailed} Pick the section again.</p> : null}
                      {demoHint ? (
                        <div className="rounded-lg border border-dashed border-primary/60 bg-primary/5 p-3 text-xs">
                          <p className="mb-1 font-semibold tracking-wide text-primary uppercase">Demo pack</p>
                          <p>{demoHint}</p>
                        </div>
                      ) : null}
                      <Button type="button" size="sm" variant="cool" onClick={scrollTo("pack-sections")}>
                        Go to the sections
                      </Button>
                    </>
                  ) : s2 === "done" ? (
                    <p className="text-muted-foreground">
                      Section {pickedSection} against P{pickedPromise}.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">One dispute per order. A green tick says the text is as committed, not that the promises hold.</p>
                  )}
                </GuideStep>
                <GuideStep n={3} state={s3} title={`Post the bond (${bond})`}>
                  {s3 === "active" ? (
                    <p className="text-muted-foreground">Confirm the {bond} bond in your wallet. It is held by the contract until the verdict.</p>
                  ) : s3 === "busy" ? (
                    <>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Posting the bond. The order is marked disputed once the network has it.
                      </p>
                      <Button type="button" size="sm" variant="outline" onClick={scrollTo("dispute-box")}>
                        Watch the progress
                      </Button>
                    </>
                  ) : s3 === "done" ? (
                    <p className="text-muted-foreground">Posted {when(o.disputedAt)}.</p>
                  ) : (
                    <p className="text-muted-foreground">Held by the contract until the verdict.</p>
                  )}
                </GuideStep>
                <GuideStep n={4} state={s4} title="Ask the validators">
                  {s4 === "active" || s4 === "busy" ? (
                    <>
                      <p>
                        Studio assigns five validators; each one that answers in time reads the section against the promise on its own model, asks both questions (does it break the promise? does it keep it?) and votes on one word. The majority decides. The round takes one to two minutes.
                      </p>
                      {s4 === "busy" ? (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" /> The validators are reading now.
                        </p>
                      ) : (
                        <>
                          <p className="text-muted-foreground">
                            {disputedText === null
                              ? "The section text is sent on chain. Load the pack (step 1) or paste the exact text in the dispute box, then press Ask the validators."
                              : "The section text is sent on chain. Press Ask the validators in the dispute box."}
                          </p>
                          {staleAt && !canSettleStale ? (
                            <p className="text-muted-foreground">
                              Nothing happens until someone presses it. With no verdict by {when(staleAt)}, anyone can settle by rule: the seller gets the price and {you} get{viewer === "buyer" ? "" : "s"} only the bond back.
                            </p>
                          ) : null}
                        </>
                      )}
                      <Button type="button" size="sm" variant={s4 === "busy" ? "outline" : "cool"} onClick={scrollTo("dispute-box")}>
                        {s4 === "busy" ? "Watch the votes" : "Go to the dispute"}
                      </Button>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Studio assigns five validators; each one that answers in time runs both questions on its own model, and the majority&apos;s one word is the verdict.</p>
                  )}
                </GuideStep>
                <GuideStep n={5} state={s5} title="Verdict">
                  <OutcomeList you={you} your={your} className="text-muted-foreground" />
                </GuideStep>
              </ol>
            </section>
          );

          return (
            <div className="grid min-w-0 gap-8 lg:grid-cols-[400px_1fr]">
              <div className="min-w-0 lg:col-start-2 lg:row-start-1">{checklist}</div>
              <div className="flex min-w-0 flex-col items-center gap-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:items-start">
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
                      {o.status === "paid" ? countdown(deadline, cnow) : when(deadline)}
                    </span>
                  </div>
                  {o.status === "paid" ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Bond to dispute</span>
                      <span>{gen(o.bondRequiredAtto)}</span>
                    </div>
                  ) : bondShown > 0n ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Bond posted</span>
                      <span className="text-right">
                        {bond}
                        <span className="text-muted-foreground">
                          {o.status === "disputed" ? ", held" : o.status === "settled" && o.verdict === "keeps" ? ", to the seller" : ", returned"}
                        </span>
                      </span>
                    </div>
                  ) : null}
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
                      <span className="text-muted-foreground">Your last transaction</span>
                      <TxLink hash={txHash} />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 space-y-8 lg:col-start-2 lg:row-start-2">
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
                    <p className="mt-2 text-sm">{o.verdictLine || verdictSentence(o, viewer)}</p>
                    {o.verdictLine ? (
                      <p className="mt-1 text-xs text-muted-foreground">The contract wrote this sentence when it stored the verdict, from the verdict word, the numbers and the amounts only.</p>
                    ) : null}
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
                    {judged ? (
                      <div className="mt-4 space-y-2 rounded-lg border bg-background/60 p-3">
                        {l?.promises[o.promiseIndex] ? (
                          <p className="flex items-start gap-2 text-sm">
                            <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-gold/15 px-2 font-mono text-[11px] font-semibold text-gold">P{o.promiseIndex + 1}</span>
                            <span className="break-words">{l.promises[o.promiseIndex]}</span>
                          </p>
                        ) : null}
                        <p className="text-xs font-semibold">
                          {overCap ? `The judged text (section ${o.sectionIndex + 1})` : `The text the validators read (section ${o.sectionIndex + 1})`}
                        </p>
                        <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 px-3 py-2 font-sans text-xs leading-relaxed whitespace-pre-wrap break-words">{o.revealedText}</pre>
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          {judgedOk ? <Check className="mt-0.5 size-3.5 shrink-0 text-keeps" /> : null}
                          <span>
                            {judgedOk
                              ? `Its sha256 matches what the seller committed for section ${o.sectionIndex + 1} before the sale.`
                              : `The contract accepts this text only when it hashes to what the seller committed for section ${o.sectionIndex + 1}.`}{" "}
                            It is public on chain, so anyone can check the verdict against it.
                            {overCap ? ` It is ${charCount(o.revealedText)} characters, over the ${MAX_SECTION_CHARS}-character cap, so no model was asked.` : ""}
                          </span>
                        </p>
                      </div>
                    ) : null}
                    <SettledNote listing={o.listing} />
                  </section>
                ) : null}

                {o.status === "settled_stale" ? (
                  <section className="rounded-2xl border p-5 text-sm">
                    <h2 className="text-lg font-semibold">Settled by rule</h2>
                    <p className="mt-2 text-muted-foreground">
                      {o.verdictLine || `No verdict was stored within ${STALE_HOURS} hours of the dispute, so the price went to the seller and the bond back to the buyer.`}
                    </p>
                    <SettledNote listing={o.listing} />
                  </section>
                ) : null}
                {o.status === "refunded" ? (
                  <section className="rounded-2xl border border-breaks/50 bg-breaks/10 p-5 text-sm">
                    <h2 className="text-lg font-semibold">Refunded</h2>
                    <p className="mt-2">
                      {o.verdictLine || `Section ${o.missingIndex + 1} was reported missing and the seller did not reveal it within ${REVEAL_HOURS} hours. The full price went back to the buyer.`}
                    </p>
                  </section>
                ) : null}
                {o.status === "released" ? (
                  <section className="rounded-2xl border border-keeps/50 bg-keeps/10 p-5 text-sm">
                    <h2 className="text-lg font-semibold">Released to the seller</h2>
                    <p className="mt-2">{o.verdictLine || `The dispute window closed with no dispute, so ${gen(o.paidSeller || o.priceAtto)} went to the seller.`}</p>
                  </section>
                ) : null}

                {/* two-step dispute checklist (in progress or resumable) */}
                {(o.status === "disputed" || bondTx.hash || judgeTx.hash) && o.status !== "settled" ? (
                  <section id="dispute-box" className="scroll-mt-24 space-y-4 rounded-2xl border border-gold/50 bg-card p-5">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <ShieldAlert className="size-5 text-gold" /> Dispute: section {(o.status === "disputed" ? o.sectionIndex : pick?.section ?? o.sectionIndex) + 1} vs P
                      {(o.status === "disputed" ? o.promiseIndex : pick?.promise ?? o.promiseIndex) + 1}
                    </h2>
                    <ol className="space-y-4 text-sm">
                      <li className="flex gap-3">
                        <StepDot state={bondDone ? "done" : bondTx.hash || bondRecording ? "busy" : "todo"} />
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="font-medium">1. Post the bond ({bond})</p>
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
                            <Recording gaveUp={rereadGaveUp} onReread={rereadNow}>
                              Recording the bond… the order row is re-read until it says disputed.
                            </Recording>
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
                                  disabled={stillOld || judgeTx.sending || (!!judgeTx.hash && !judgeTx.final) || (disputedText === null && !pasted.trim())}
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
                          {o.status === "disputed" && landedOk(judgeTx) ? (
                            <Recording gaveUp={rereadGaveUp} onReread={rereadNow}>
                              Recording the verdict… the order row is re-read until it shows the verdict.
                            </Recording>
                          ) : null}
                        </div>
                      </li>
                    </ol>
                    {/* The way back out of a dispute, and the only one the buyer holds.
                        judge() refuses any text that does not hash to the seller's commitment, so a
                        buyer who disputed a section the seller never delivered as committed cannot
                        judge it, cannot report it missing from `disputed`, and would lose the price
                        to settle_stale 24 hours later. */}
                    {o.status === "disputed" && !o.verdict && isBuyer ? (
                      <div className="space-y-2 rounded-lg border border-dashed p-3 text-xs">
                        <p className="font-medium">Disputed the wrong section, or the text never matched?</p>
                        <p className="text-muted-foreground">
                          Take the dispute back. Your {bond} bond returns, the price stays in escrow and the order goes back to paid with the same
                          deadline ({when(deadline)}), where you can dispute another section or report one missing instead.
                        </p>
                        <WalletGate action="withdraw the dispute">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={stillOld || withdrawTx.sending || (!!withdrawTx.hash && !withdrawTx.final) || landedOk(withdrawTx)}
                            onClick={() => void send(withdrawTx, o, "withdraw_dispute", [o.id])}
                          >
                            <Undo2 /> Withdraw the dispute
                          </Button>
                        </WalletGate>
                        {withdrawTx.error ? <p className="text-breaks">{withdrawTx.error}</p> : null}
                        {withdrawTx.hash ? <TxRail hash={withdrawTx.hash} label="Withdrawing the dispute" onDone={withdrawTx.onDone} className="mt-2" /> : null}
                        {withdrawTx.final && failureOf(withdrawTx.final) ? <p className="text-breaks">{failureOf(withdrawTx.final)}</p> : null}
                        {landedOk(withdrawTx) ? (
                          <Recording gaveUp={rereadGaveUp} onReread={rereadNow}>
                            Recording the withdrawal… the order row is re-read until it says paid again.
                          </Recording>
                        ) : null}
                      </div>
                    ) : null}
                    {o.status === "disputed" && !o.verdict && !canSettleStale && staleAt ? (
                      <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        <Clock className="mt-0.5 size-3.5 shrink-0" />
                        <p>
                          Nothing happens until someone presses Ask the validators. If no verdict is stored by {when(staleAt)} ({countdown(staleAt, cnow)}), anyone can settle by rule: the seller gets the price and {you} get{viewer === "buyer" ? "" : "s"} only {viewer === "buyer" ? "your" : "their"} bond back.
                        </p>
                      </div>
                    ) : null}
                    {canSettleStale ? (
                      <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                        <p>No verdict for {STALE_HOURS} hours. Anyone may settle by rule: price to the seller, bond back to the buyer. Ask the validators still works until someone does.</p>
                        <WalletGate action="settle">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            disabled={stillOld || ruleTx.sending || (!!ruleTx.hash && !ruleTx.final)}
                            onClick={() => void send(ruleTx, o, "settle_stale", [o.id])}
                          >
                            Settle by rule
                          </Button>
                        </WalletGate>
                        {ruleTx.error ? <p className="mt-1 text-breaks">{ruleTx.error}</p> : null}
                        {ruleTx.hash ? <TxRail hash={ruleTx.hash} label="Settling by rule" onDone={ruleTx.onDone} className="mt-2" /> : null}
                        {ruleTx.final && failureOf(ruleTx.final) ? <p className="mt-1 text-breaks">{failureOf(ruleTx.final)}</p> : null}
                        {landedOk(ruleTx) ? (
                          <Recording gaveUp={rereadGaveUp} onReread={rereadNow} className="mt-2">
                            Recording the settlement… the order row is re-read until it says settled by rule.
                          </Recording>
                        ) : null}
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
                      Reported {when(o.missingAt)}. The seller has until {when(revealDeadline)} ({countdown(revealDeadline, cnow)}) to reveal the exact text of section {o.missingIndex + 1} on chain. If they do not, anyone can trigger a full refund of {gen(o.priceAtto)} to the buyer; no model is asked.
                    </p>
                    {isSeller ? (
                      <div className="space-y-2">
                        <p className="font-medium">You are the seller. Paste the exact text of section {o.missingIndex + 1}:</p>
                        <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} className="font-mono text-xs" />
                        <WalletGate action="reveal">
                          <Button
                            type="button"
                            variant="cool"
                            disabled={stillOld || !pasted.trim() || revealTx.sending || (!!revealTx.hash && !revealTx.final)}
                            onClick={() => void send(revealTx, o, "reveal", [o.id, pasted])}
                          >
                            Reveal on chain
                          </Button>
                        </WalletGate>
                        {revealTx.error ? <p className="text-breaks">{revealTx.error}</p> : null}
                        {revealTx.hash ? <TxRail hash={revealTx.hash} label="Revealing the section" onDone={revealTx.onDone} /> : null}
                        {revealTx.final && failureOf(revealTx.final) ? <p className="text-breaks">{failureOf(revealTx.final)}</p> : null}
                        {landedOk(revealTx) ? (
                          <Recording gaveUp={rereadGaveUp} onReread={rereadNow}>
                            Recording the reveal… the order row is re-read until the order is back in escrow.
                          </Recording>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <WalletGate action="refund">
                        <Button
                          type="button"
                          variant="cool"
                          disabled={stillOld || !canRefundMissing || ruleTx.sending || (!!ruleTx.hash && !ruleTx.final)}
                          title={canRefundMissing ? undefined : `Opens ${when(revealDeadline)}`}
                          onClick={() => void send(ruleTx, o, "refund_missing", [o.id])}
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
                      {landedOk(ruleTx) ? (
                        <Recording gaveUp={rereadGaveUp} onReread={rereadNow}>
                          Recording the refund… the order row is re-read until it says refunded.
                        </Recording>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {/* Sections the seller put on chain after a missing report: public, hash-checked, disputable.
                    They stay on the page after the order ends, whatever it ended as: the contract keeps every
                    reveal for good, and on a settled_stale or refunded order this text is the only public
                    evidence that the seller did deliver. A section that was judged has its own card
                    above, and the filter drops it here so no section is printed twice. */}
                {revealedOnChain.length > 0 ? (
                  <section className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <Link2 className="size-5 text-gold" />
                      {revealedOnChain.length === 1 ? `Section ${revealedOnChain[0].index + 1} was revealed on chain` : `${revealedOnChain.length} sections were revealed on chain`}
                    </h2>
                    <p className="text-muted-foreground">
                      The buyer reported {revealedOnChain.length === 1 ? "it" : "them"} missing; the seller then put the exact text on chain, and it hashes to what they committed before the sale. A revealed section cannot be reported missing again.
                      {o.status === "paid" && windowOpen
                        ? ` The order is back in escrow and the dispute window runs to ${when(deadline)}, so a revealed section can still be disputed${viewer === "buyer" ? " from the section list below" : " by the buyer"}.`
                        : ""}
                    </p>
                    {revealedOnChain.map((r) => (
                      <div key={r.index} className="space-y-1">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Check className="size-3.5 text-keeps" /> Section {r.index + 1}, matches the committed hash
                        </p>
                        <pre className="max-h-60 overflow-auto rounded-lg border bg-muted/30 px-3 py-2 font-sans text-xs leading-relaxed whitespace-pre-wrap break-words">{r.text}</pre>
                      </div>
                    ))}
                  </section>
                ) : null}

                {/* release */}
                {canRelease ? (
                  <section className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
                    <h2 className="text-lg font-semibold">The window closed with no dispute</h2>
                    <p className="text-muted-foreground">Anyone may release the price to the seller now.</p>
                    <WalletGate action="release">
                      <Button
                        type="button"
                        variant="cool"
                        disabled={stillOld || releaseTx.sending || (!!releaseTx.hash && !releaseTx.final)}
                        onClick={() => void send(releaseTx, o, "release", [o.id])}
                      >
                        Release {gen(o.priceAtto)} to seller
                      </Button>
                    </WalletGate>
                    {releaseTx.error ? <p className="text-breaks">{releaseTx.error}</p> : null}
                    {releaseTx.hash ? <TxRail hash={releaseTx.hash} label="Releasing to the seller" onDone={releaseTx.onDone} /> : null}
                    {releaseTx.final && failureOf(releaseTx.final) ? <p className="text-breaks">{failureOf(releaseTx.final)}</p> : null}
                    {landedOk(releaseTx) ? (
                      <Recording gaveUp={rereadGaveUp} onReread={rereadNow}>
                        Recording the release… the order row is re-read until it says released.
                      </Recording>
                    ) : null}
                  </section>
                ) : null}

                {/* the pack */}
                <section id="the-pack" className="scroll-mt-24 space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">The pack</h2>
                      <p className="text-sm text-muted-foreground">
                        {l ? `${l.sectionCount} sections, ${l.promises.length} promises.` : "The listing did not load, so the promises and the hashes are not here."} Every section is hashed here and compared with the chain.
                      </p>
                      <p className="text-xs text-muted-foreground">A tick means the text is exactly what the seller committed before the sale. Whether it keeps the promises is what a dispute decides.</p>
                    </div>
                    {rows ? (
                      <span className="text-xs text-muted-foreground">
                        {rows.filter((s) => s.ok).length}/{rows.length} delivered as committed
                      </span>
                    ) : null}
                  </div>

                  {l ? <PromisePills promises={l.promises} highlight={o.status !== "paid" && o.promiseIndex >= 0 ? o.promiseIndex : undefined} /> : null}

                  {/* the model-free way out of an undelivered or altered pack */}
                  {rows && undelivered.length > 0 && o.status === "paid" ? (
                    <div className="space-y-1 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm">
                      <p className="font-medium">
                        {undelivered.length === rows.length ? "The seller has not delivered this pack." : `${undelivered.length} of ${rows.length} sections did not arrive as committed.`}
                      </p>
                      <p className="text-muted-foreground">
                        Report a missing section: the seller then has {REVEAL_HOURS} hours to reveal its text on chain, and if they do not, anyone can trigger a full refund. No model is asked; the contract only checks the clock and the hash.
                      </p>
                      {/* One report is all a pack that never arrived needs: the seller cannot reveal what
                          they never had, and the refund is the whole price. The cap is on the contract. */}
                      {reportsLeft !== null ? (
                        <p className="text-xs text-muted-foreground">
                          {reportsLeft === 0
                            ? `This order has used all ${MAX_MISSING_REPORTS} of its missing reports. One section that is never revealed refunds the whole price, so report a section that did not arrive and wait out the ${REVEAL_HOURS} hours.`
                            : `${reportsLeft} of ${MAX_MISSING_REPORTS} reports left on this order. One is enough when the pack never arrived: the seller cannot reveal what they never had, and the refund is the whole price.`}
                        </p>
                      ) : null}
                      {packError ? <p className="text-xs text-muted-foreground">The delivery store said: {packError}</p> : null}
                      {!windowOpen ? <p className="text-xs text-muted-foreground">The dispute window has closed, so a report is no longer possible.</p> : !isBuyer ? <p className="text-xs text-muted-foreground">Only the buyer can report a section.</p> : null}
                    </div>
                  ) : null}

                  {!rows ? (
                    <div className="rounded-xl border border-dashed bg-card p-4 text-sm">
                      {!l ? (
                        // The order row read fine; only the listing's own read failed, so offer just that read again.
                        <div className="space-y-2">
                          <p className="text-muted-foreground">The listing did not load, so the hashes cannot be checked yet. The order itself is above.</p>
                          <Button type="button" size="sm" variant="outline" onClick={rereadNow}>
                            <RefreshCw /> Read the listing again
                          </Button>
                        </div>
                      ) : isMock ? (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" /> Loading the pack…
                        </p>
                      ) : !w.address ? (
                        <WalletGate action="read your pack">{null}</WalletGate>
                      ) : !isBuyer ? (
                        <p className="text-muted-foreground">
                          This order belongs to <span className="break-hash font-mono">{o.buyer}</span>. Connect that wallet to read the pack.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p>Sign one message to read your pack. The signature only proves you are the buyer; it is cached in this browser for this order and this wallet.</p>
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
                    <ol id="pack-sections" className="scroll-mt-24 space-y-3">
                      {rows.map((s) => (
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
                            ) : s.ok === true && s.onChain ? (
                              <span className="inline-flex items-center gap-1 text-xs text-keeps">
                                <Check className="size-3.5" /> delivered as committed, read from the chain
                              </span>
                            ) : s.ok === true ? (
                              <span className="inline-flex items-center gap-1 text-xs text-keeps">
                                <Check className="size-3.5" /> delivered as committed
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
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openDialog(s.index)}
                                  disabled={stillOld || bondRecording || bondTx.sending || (!!bondTx.hash && !bondTx.final)}
                                >
                                  <ShieldAlert /> Dispute this section ({gen(o.bondRequiredAtto)} bond)
                                </Button>
                              ) : null}
                              {s.ok !== true ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void send(missingTx, o, "report_missing", [o.id, String(s.index)])}
                                  disabled={stillOld || reportsLeft === 0 || missingTx.sending || (!!missingTx.hash && !missingTx.final) || landedOk(missingTx)}
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
                  {o.status === "paid" && landedOk(missingTx) ? (
                    <Recording gaveUp={rereadGaveUp} onReread={rereadNow} className="text-sm">
                      Recording the report… the order row is re-read until it says missing.
                    </Recording>
                  ) : null}

                  {windowOpen && isBuyer && rows ? (
                    <p className="text-xs text-muted-foreground">
                      Window: {windowLabel(l?.windowSeconds ?? 0)} from purchase, {countdown(deadline, cnow)}. A dispute posts a {gen(o.bondRequiredAtto)} bond; it comes back to you unless the validators find the promise kept.
                    </p>
                  ) : null}
                </section>
              </div>

              {/* pick a promise, then confirm: one dispute per order, so the choice is made before the wallet opens */}
              <Dialog open={dialogSection !== null} onOpenChange={(open) => !open && setDialogSection(null)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Section {(dialogSection ?? 0) + 1} breaks which promise?</DialogTitle>
                    <DialogDescription>
                      Pick one promise. You post a {gen(o.bondRequiredAtto)} bond, the contract holds it with the price, and the validators read the section against that promise. You get one dispute per order.
                    </DialogDescription>
                  </DialogHeader>
                  {l ? (
                    <div role="radiogroup" aria-label="The promise this section breaks" className="space-y-2" onKeyDown={radioKeys(l.promises.length, dialogPromise, setDialogPromise)}>
                      {l.promises.map((p, i) => {
                        const checked = dialogPromise === i;
                        return (
                          <button
                            key={i}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            tabIndex={checked || (dialogPromise === null && i === 0) ? 0 : -1}
                            data-promise={i}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-xl border bg-card px-3 py-2 text-left text-sm hover:border-gold/60 hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              checked && "border-gold bg-gold/10",
                            )}
                            onClick={() => setDialogPromise(i)}
                          >
                            <span className={cn("mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border", checked && "border-gold")} aria-hidden="true">
                              {checked ? <span className="size-2 rounded-full bg-gold" /> : null}
                            </span>
                            <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-gold/15 px-2 font-mono text-[11px] font-semibold text-gold">P{i + 1}</span>
                            <span className="break-words">{p}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
                    <p className="font-medium">Where the money goes</p>
                    <OutcomeList you="you" your="your" />
                    <p className="text-muted-foreground">
                      After the bond, press Ask the validators. Nothing happens until someone does; with no verdict {STALE_HOURS} hours after the bond, anyone can settle by rule, which pays the seller the price and returns only your bond.
                    </p>
                  </div>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                    <WalletGate action="post the bond">
                      <Button
                        type="button"
                        variant="cool"
                        className="h-auto min-h-9 w-full whitespace-normal py-2 text-center"
                        disabled={dialogPromise === null || stillOld || bondTx.sending || (!!bondTx.hash && !bondTx.final)}
                        onClick={() => {
                          if (dialogPromise === null) return;
                          const section = dialogSection ?? 0;
                          setDialogSection(null);
                          void startBond(o, section, dialogPromise);
                        }}
                      >
                        {dialogPromise === null
                          ? "Pick a promise"
                          : `Post ${gen(o.bondRequiredAtto)} bond: section ${(dialogSection ?? 0) + 1} against P${dialogPromise + 1}`}
                      </Button>
                    </WalletGate>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          );
        }}
      </ReadBlock>
    </div>
  );
}

type StepState = "todo" | "active" | "busy" | "done";

const scrollTo = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Arrow keys move the choice inside the promise radio group, as a native radio group would. */
function radioKeys(count: number, current: number | null, set: (i: number) => void) {
  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step || count === 0) return;
    e.preventDefault();
    const next = current === null ? (step > 0 ? 0 : count - 1) : (current + step + count) % count;
    set(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-promise="${next}"]`)?.focus();
  };
}

/** The three verdicts and where the price and the bond go for each, as the contract pays them. */
function OutcomeList({ you, your, className }: { you: string; your: string; className?: string }) {
  return (
    <ul className={cn("space-y-1", className)}>
      <li>
        <span className="font-medium text-breaks">breaks</span>: the price and {your} bond come back to {you}.
      </li>
      <li>
        <span className="font-medium text-keeps">keeps</span>: the price and {your} bond go to the seller.
      </li>
      <li>
        <span className="font-medium text-gold">unclear</span>: the seller gets the price; {your} bond comes back to {you}.
      </li>
    </ul>
  );
}

/** A write landed and the order row is being re-read until it shows it; after the last try, a manual re-read. */
function Recording({ gaveUp, onReread, className, children }: { gaveUp: boolean; onReread: () => void; className?: string; children: React.ReactNode }) {
  if (gaveUp) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2 text-muted-foreground", className)}>
        <span>The transaction is final, but the network has not shown the new order row yet.</span>
        <Button type="button" size="sm" variant="outline" onClick={onReread}>
          <RefreshCw /> Re-read the order
        </Button>
      </div>
    );
  }
  return (
    <p className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <Loader2 className="size-3.5 shrink-0 animate-spin" /> {children}
    </p>
  );
}

function StepDot({ state }: { state: StepState }) {
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
        state === "done" && "border-keeps bg-keeps/15 text-keeps",
        state === "busy" && "border-primary text-primary",
        state === "active" && "border-gold bg-gold/15 text-gold",
        state === "todo" && "text-muted-foreground",
      )}
    >
      {state === "done" ? (
        <Check className="size-3.5" />
      ) : state === "busy" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Circle className={cn("size-2 fill-current", state === "todo" && "opacity-40")} />
      )}
    </span>
  );
}

/** One row of the guided checklist: the active step is boxed in gold, done steps are ticked. */
function GuideStep({ n, state, title, children }: { n: number; state: StepState; title: string; children?: React.ReactNode }) {
  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border border-transparent px-3 py-2",
        state === "active" && "border-gold/60 bg-gold/10",
        state === "busy" && "border-primary/40 bg-primary/5",
      )}
      aria-current={state === "active" ? "step" : undefined}
    >
      <StepDot state={state} />
      <div className="min-w-0 flex-1 space-y-2 break-words">
        <p className={cn("font-medium", state === "todo" && "text-muted-foreground")}>
          {n}. {title}
        </p>
        {children}
      </div>
    </li>
  );
}

/** Under a verdict: the order is spent, a second ruling needs a second purchase. */
function SettledNote({ listing }: { listing: string }) {
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-lg border bg-background/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p>This order is settled: one dispute per order. Want another ruling? Buy the pack again and dispute a different section.</p>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link href={`/pack/${listing}`}>Buy the pack again</Link>
      </Button>
    </div>
  );
}

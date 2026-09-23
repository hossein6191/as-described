"use client";

// The step-by-step guide a first-time visitor follows. Each step reads live state (wallet,
// balance, register, and this wallet's orders and listings on chain) so the "now" step is always
// the one that actually comes next, and its button goes to the exact page for it. When that page
// is the one already open, the button becomes the instruction for what to press here. A failed
// read shows the error with its retry, and no step is marked "now" until the chain has answered.
// Collapsible, remembered per browser; the "?" pill brings it back.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown, Check, ChevronDown, ChevronUp, CircleDot, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReadError, SnapshotBanner } from "@/components/read-state";
import { useWallet } from "@/components/wallet";
import { useRead } from "@/components/use-read";
import { useLocal } from "@/components/use-local";
import {
  chainTime,
  contractAddress,
  isMock,
  readAllListings,
  readOrder,
  readOrdersOfBuyer,
  type Listing,
  type Order,
  type ReadResult,
} from "@/lib/chain";
import { MOCK_BUYER } from "@/lib/chain-mock";
import { DEMO_SELLER } from "@/lib/config";
import { demoKeys } from "@/lib/demo-keys";
import { DEMO_PACKS } from "@/lib/demo-packs";
import { readItem, writeItem } from "@/lib/browser-store";
import { gen, when } from "@/lib/format";
import { cn } from "@/lib/utils";

const HIDDEN_KEY = "ad:guide-hidden";

/** The contract's STALE_HOURS and REVEAL_HOURS, in ms. */
const DAY_MS = 24 * 3600 * 1000;

/** How many of this wallet's newest orders the guide reads (one gen_call each). */
const RECENT_ORDERS = 5;

const COUNT = ["zero", "one", "two", "three", "four", "five", "six", "seven"];

const link = "text-primary underline-offset-4 hover:underline";

type Step = {
  title: string;
  detail: React.ReactNode;
  done: boolean;
  href?: string;
  cta?: string;
  /** what to press when `href` is the page already open */
  here?: string;
  action?: string;
  onAction?: () => void;
};

type Progress = {
  bought: boolean; // this wallet paid for at least one order
  listed: Listing | null; // the newest pack this wallet listed
  demo: Listing | null; // an open demo pack with a broken promise that this wallet can buy
  latest: Order | null; // the newest order this wallet paid
  open: Order | null; // the newest order still inside its dispute window, not disputed
  missing: Order | null; // the newest order with a section reported missing
  asking: Order | null; // the newest order with a bond posted and no verdict yet
  staleAt: number; // when `asking` may be settled by rule (ms), 0 when there is none
  stalePassed: boolean; // that moment has passed on the chain's clock
  judged: Order | null; // the newest order settled by the validators, else by rule
  gap: string; // the first error among the per-order reads; "" when every read answered
};

/**
 * An instant the contract wrote ("2026-09-22T17:52:39.120654Z") in ms, NaN when blank. Fractions past
 * the millisecond are cut (not every browser parses six digits) and a missing zone means UTC.
 */
function instant(iso: string): number {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(iso.trim());
  if (!m) return NaN;
  const zone = !m[3] || m[3].toUpperCase() === "Z" ? "Z" : m[3].replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2");
  return Date.parse(m[1] + (m[2] ? m[2].slice(0, 4) : "") + zone);
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "could not reach the network";

const samePromises = (a: string[], b: string[]) => a.length === b.length && a.every((p, i) => p.trim() === b[i].trim());

/**
 * The open listings that are exactly a demo pack from lib/demo-packs.ts: the same section hashes
 * (so the text ships with the site) and the same promises (so the demo's broken or kept promise is
 * the one on chain). Keyed by the DEMO_PACKS index. The site owner's listing wins, then the newest.
 * `exclude` drops one seller's listings (a seller cannot buy their own pack).
 */
export async function demoListings(listings: Listing[], exclude = ""): Promise<Map<number, Listing>> {
  const found = new Map<number, Listing>();
  let keys: string[];
  try {
    keys = (await demoKeys()).map((k) => k.toLowerCase());
  } catch {
    return found; // no WebCrypto (an insecure origin): nothing can be matched
  }
  const owner = DEMO_SELLER.toLowerCase();
  const skip = exclude.toLowerCase();
  for (const l of listings) {
    const seller = l.seller.toLowerCase();
    if (!l.open || (skip && seller === skip)) continue;
    const i = keys.indexOf(l.hashes.map((h) => h.toLowerCase()).join(","));
    if (i < 0 || !samePromises(l.promises, DEMO_PACKS[i].promises)) continue;
    const prev = found.get(i);
    if (!prev || seller === owner || prev.seller.toLowerCase() !== owner) found.set(i, l);
  }
  return found;
}

/** The demo pack a newcomer should buy first: the vegetarian pack, else any demo whose hint says a promise breaks. */
function firstDemo(found: Map<number, Listing>): Listing | null {
  const first = found.get(0);
  if (first) return first;
  const breaking = [...found.keys()].sort((a, b) => a - b).find((i) => /\bbreaks promise P\d/i.test(DEMO_PACKS[i].hint));
  return breaking === undefined ? null : found.get(breaking) ?? null;
}

/**
 * What this wallet has done on the register so far. Step 3 ("bought or listed") comes from two
 * list reads before any per-order read; the newest orders are then read side by side, and one that
 * fails leaves the others standing (its error is reported as `gap`).
 */
async function readProgress(address: string): Promise<ReadResult<Progress>> {
  const me = address.toLowerCase();
  const [ids, all] = await Promise.allSettled([readOrdersOfBuyer(address), readAllListings()]);
  if (ids.status === "rejected") throw ids.reason;
  const bought = ids.value.data.length > 0;
  // A wallet that bought is past step 3 whatever the listings say; one that did not needs them.
  if (all.status === "rejected" && !bought) throw all.reason;
  const listings = all.status === "fulfilled" ? all.value.data : [];
  let gap = all.status === "rejected" ? messageOf(all.reason) : "";
  let snapshot = ids.value.source === "snapshot" || (all.status === "fulfilled" && all.value.source === "snapshot");

  const mine = listings.filter((l) => l.seller.toLowerCase() === me);
  const demo = firstDemo(await demoListings(listings, me));

  const recent = ids.value.data.slice(-RECENT_ORDERS).reverse();
  const reads = await Promise.allSettled(recent.map((id) => readOrder(id)));
  const orders: Order[] = [];
  for (const r of reads) {
    if (r.status === "rejected") {
      if (!gap) gap = messageOf(r.reason);
    } else {
      if (r.value.data) orders.push(r.value.data);
      if (r.value.source === "snapshot") snapshot = true;
    }
  }

  const asking = orders.find((o) => o.status === "disputed") ?? null;
  const disputedAt = asking ? instant(asking.disputedAt) : NaN;
  const staleAt = Number.isNaN(disputedAt) ? 0 : disputedAt + DAY_MS;
  return {
    data: {
      bought,
      listed: mine.length ? mine[mine.length - 1] : null,
      demo,
      latest: orders[0] ?? null,
      open: orders.find((o) => o.status === "paid" && o.windowOpen) ?? null,
      missing: orders.find((o) => o.status === "missing") ?? null,
      asking,
      staleAt,
      // the chain's clock when the order was read (the local clock for a row with no read time)
      stalePassed: !!asking && staleAt > 0 && chainTime(asking, asking.readAtMs || Date.now()) >= staleAt,
      judged: orders.find((o) => o.status === "settled") ?? orders.find((o) => o.status === "settled_stale") ?? null,
      gap,
    },
    source: snapshot ? "snapshot" : "chain",
  };
}

const whenMs = (ms: number) => (ms > 0 ? when(new Date(ms).toISOString()) : "");

/** The money sentence for a settled order when the register does not write one itself. */
function verdictSentence(o: Order): string {
  if (o.verdict === "breaks") return `The validators found that section ${o.sectionIndex + 1} breaks promise P${o.promiseIndex + 1}: the price and the bond went back to the buyer.`;
  if (o.verdict === "keeps") return `The validators found that section ${o.sectionIndex + 1} keeps promise P${o.promiseIndex + 1}: the price and the bond went to the seller.`;
  return `The validators could not get a clean yes and no on section ${o.sectionIndex + 1} against P${o.promiseIndex + 1} (unclear): the seller kept the price and the bond went back to the buyer.`;
}

export function StartHere({ className, compact = false }: { className?: string; compact?: boolean }) {
  const w = useWallet();
  const pathname = usePathname();
  const sectionRef = React.useRef<HTMLElement>(null);
  const [funding, setFunding] = React.useState(false);
  const hasRegister = useLocal(() => !!contractAddress() || isMock, true);
  const hidden = useLocal(() => readItem(HIDDEN_KEY) === "1", false);
  const hide = (v: boolean) => writeItem(HIDDEN_KEY, v ? "1" : "0");

  const address = w.address || (isMock ? MOCK_BUYER : "");
  const reading = !!address && !hidden && hasRegister;
  const progress = useRead(() => readProgress(address), [address], { enabled: reading });
  const p = progress.data;

  // Every buy, bond, verdict and faucet payment moves this wallet's balance: read the chain again
  // then, keeping the steps on screen, so the guide follows a purchase without a reload.
  const balanceKey = w.balanceAtto.toString();
  const lastBalance = React.useRef(balanceKey);
  const { refresh } = progress;
  const hasProgress = !!p;
  React.useEffect(() => {
    if (lastBalance.current === balanceKey) return;
    lastBalance.current = balanceKey;
    if (hasProgress) void refresh();
  }, [balanceKey, hasProgress, refresh]);

  const fund = async () => {
    setFunding(true);
    try {
      await w.getTestGen();
    } catch {
      /* the wallet state shows the error */
    } finally {
      setFunding(false);
    }
  };

  const connected = !!w.address || isMock;
  const funded = connected && (w.balanceAtto > 0n || isMock || !!p?.bought || !!p?.listed);
  const demo = p?.demo ?? null;
  const buyHref = demo ? `/pack/${demo.id}` : "/shop";
  const buyCta = demo ? `Open demo pack ${demo.id}` : "Open the shop";
  const buyHere = demo ? `Press “Pay ${gen(demo.priceAtto)}” on this page.` : "Pick a pack below, press “Buy”, then “Pay” on its page.";

  const steps: Step[] = [
    {
      title: "Connect a wallet",
      detail: "Rabby or MetaMask. The site switches it to GenLayer Studio (chain 61999) for you.",
      done: connected,
      action: connected ? undefined : "Connect wallet",
      onAction: connected ? undefined : () => void w.connect(),
    },
    {
      title: "Get test GEN",
      detail: "Studio is a test network: one click funds your wallet with 10 GEN. No real money anywhere.",
      done: funded,
      action: connected && !funded ? (funding ? "Waiting for the faucet…" : "Get 10 test GEN") : undefined,
      onAction: connected && !funded ? () => void fund() : undefined,
    },
    {
      title: "Buy a demo pack",
      detail: (
        <>
          {demo ? (
            <>
              Start with demo pack {demo.id} ({gen(demo.priceAtto)}): one of its sections breaks a promise, and its order page gives you a hint.{" "}
            </>
          ) : (
            <>
              Pick a pack in the <Link href="/shop" className={link}>shop</Link>, press &ldquo;Buy&rdquo;, then &ldquo;Pay&rdquo; on its page.{" "}
            </>
          )}
          Its price goes into escrow; a dispute adds a bond of 20% of the price. Or <Link href="/sell" className={link}>sell</Link> a pack of your own.
        </>
      ),
      done: !!p && (p.bought || !!p.listed),
      href: buyHref,
      cta: buyCta,
      here: buyHere,
    },
    disputeStep(p, { buyHref, buyCta, buyHere, demo }),
    verdictStep(p),
  ];
  if (!hasRegister) {
    steps.splice(2, 0, {
      title: "Point the site at a register",
      detail: "This site is not connected to a deployed contract yet. Deploy one from your wallet on the Deploy page; it takes one signature.",
      done: false,
      href: "/deploy",
      cta: "Deploy",
      here: "Press “Deploy” below and sign once in your wallet.",
    });
  }

  // Until the chain has said what this wallet did, the steps that depend on it are neither done
  // nor "now": a failed or slow read must never send a buyer back to the shop to pay twice.
  const firstChainStep = hasRegister ? 2 : 3;
  const unknown = reading && !p;
  let now = steps.findIndex((s) => !s.done);
  if (unknown && now >= firstChainStep) now = -2;
  const allDone = now === -1;

  if (hidden) {
    return (
      <div className={cn("flex justify-end", className)}>
        <button
          type="button"
          onClick={() => hide(false)}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <HelpCircle className="size-3.5" /> How do I try this?
        </button>
      </div>
    );
  }

  const onPage = (href?: string) => !!href && href.split("?")[0] === pathname;
  // The page below the guide, brought into view clear of the sticky header.
  const showBelow = () => {
    const next = sectionRef.current?.nextElementSibling;
    if (!next) return;
    const top = next.getBoundingClientRect().top + window.scrollY - 72; // clear the sticky header
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };
  const readProblem = progress.error || p?.gap || "";

  return (
    <section
      ref={sectionRef}
      aria-label="How to try As Described"
      className={cn("rounded-2xl border bg-card p-4 sm:p-6", className)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {allDone ? "You have done the whole loop" : `Try it in ${COUNT[steps.length] ?? steps.length} steps`}
          </h2>
          {!compact && (
            <p className="text-sm text-muted-foreground">
              {allDone
                ? "Buy another pack and dispute a different section, or sell one of your own."
                : "One test wallet, a few minutes of network time, and one real dispute decided by validators."}
            </p>
          )}
          {reading && progress.loading ? (
            <p className="text-xs text-muted-foreground" role="status">
              Checking what this wallet has done on chain…
            </p>
          ) : unknown && progress.error ? (
            <p className="text-xs text-muted-foreground">The next step shows once the chain answers.</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => hide(true)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Hide the guide"
        >
          {compact ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>
      {reading && readProblem ? (
        <ReadError
          compact
          className="mb-3"
          detail={readProblem}
          // with steps on screen, re-read in place; with none, start the read over
          onRetry={p ? () => void refresh() : progress.retry}
        />
      ) : null}
      {reading && progress.source === "snapshot" ? <SnapshotBanner className="mb-3" /> : null}
      {/* the current step gets the room its instructions need: a full row at two columns, a wider card in one row */}
      <ol className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-stretch">
        {steps.map((s, i) => {
          const isNow = i === now;
          const here = isNow && onPage(s.href);
          return (
            <li
              key={i}
              aria-current={isNow ? "step" : undefined}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-xl border p-3 text-sm lg:flex-1",
                isNow && "sm:col-span-2 lg:flex-[2.4]",
                s.done ? "border-keeps/40 bg-keeps/5" : isNow ? "border-primary/60 bg-primary/5" : "border-border/60",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    s.done ? "bg-keeps text-background" : isNow ? "bg-primary text-background" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {s.done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="font-medium">{s.title}</span>
                {isNow && <CircleDot className="ml-auto size-3.5 shrink-0 text-primary" aria-label="You are here" />}
              </div>
              {(!compact || isNow) && <div className="text-xs text-muted-foreground">{s.detail}</div>}
              {s.action && s.onAction ? (
                <Button variant={isNow ? "cool" : "outline"} size="sm" onClick={s.onAction} disabled={funding && s.title === "Get test GEN"}>
                  {s.action}
                </Button>
              ) : here ? (
                <div className="mt-auto space-y-2">
                  <p className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-foreground">
                    {s.here ?? "This page is the one for this step."}
                  </p>
                  <Button variant="outline" size="sm" className="w-full" onClick={showBelow}>
                    <ArrowDown /> Show me
                  </Button>
                </div>
              ) : s.href && (isNow || (allDone && i === steps.length - 1)) ? (
                <Button variant={isNow ? "cool" : "outline"} size="sm" className="mt-auto" asChild>
                  <Link href={s.href}>{s.cta ?? "Open"}</Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {w.error && <p className="mt-3 text-xs text-rose-300">{w.error}</p>}
    </section>
  );
}

/** Step 4: read the pack and dispute a section, or the seller's version when this wallet only listed. */
function disputeStep(
  p: Progress | null,
  buy: { buyHref: string; buyCta: string; buyHere: string; demo: Listing | null },
): Step {
  const title = "Read your pack, then dispute a section";
  const standard = (
    <>
      Your order page shows every section. A tick only means the text is what the seller committed; read the sections against the
      promises, press &ldquo;Dispute this section&rdquo; on the one that breaks a promise, then pick the promise it breaks and ask the validators. One dispute per order, so
      choose carefully.
    </>
  );
  if (!p) return { title, detail: standard, done: false };

  if (!p.bought && p.listed) {
    const l = p.listed;
    return {
      title: `Your pack ${l.id} is listed`,
      detail: (
        <>
          Buyers pay its price into escrow, and <Link href={`/pack/${l.id}`} className={link}>its page</Link> lists every order. Once the
          dispute window closes, &ldquo;Release&rdquo; on the order pays you; if a buyer reports a section missing, you have 24 hours to put its text on
          chain. To see a dispute yourself, buy a pack you did not list
          {buy.demo ? ` (demo pack ${buy.demo.id} is one)` : ""}: a seller cannot buy their own. A second wallet works too.
        </>
      ),
      done: false,
      href: buy.buyHref,
      cta: buy.buyCta,
      here: buy.demo ? buy.buyHere : "Pick a pack below that another wallet listed, press “Buy”, then “Pay” on its page.",
    };
  }

  if (p.asking || p.judged) return { title, detail: standard, done: true };

  if (p.open) {
    return {
      title,
      detail: standard,
      done: false,
      href: `/order/${p.open.id}`,
      cta: `Open order ${p.open.id}`,
      here: "Read the sections below against the promises, then press “Dispute this section” on the one that breaks one.",
    };
  }

  if (p.missing) {
    const o = p.missing;
    const at = instant(o.missingAt);
    return {
      title: "Wait for the missing section",
      detail: (
        <>
          You reported section {o.missingIndex + 1} of order {o.id} missing. The seller has 24 hours to put its exact text on chain
          {Number.isNaN(at) ? "" : ` (until ${whenMs(at + DAY_MS)})`}. If they do, read it and dispute it if it breaks a promise; if
          they do not, the order page offers you a &ldquo;Full refund&rdquo;.
        </>
      ),
      done: false,
      href: `/order/${o.id}`,
      cta: `Open order ${o.id}`,
      here: "The order below shows the missing section and, once the 24 hours pass, the “Full refund” button.",
    };
  }

  if (!p.latest) {
    // bought, but no order could be read: the read error above says why
    return { title, detail: standard, done: false, href: "/orders", cta: "My orders", here: "Open one of your orders below." };
  }

  return {
    title,
    detail: (
      <>
        None of your newest orders can be disputed any more (order {p.latest.id} is closed: its window ended or it was refunded). Buy
        another pack to try a dispute.
      </>
    ),
    done: false,
    href: buy.buyHref,
    cta: buy.buyCta,
    here: buy.buyHere,
  };
}

/** Step 5: press Ask the validators on a disputed order, then the verdict that moved the money. */
function verdictStep(p: Progress | null): Step {
  if (p?.asking) {
    const o = p.asking;
    const by = whenMs(p.staleAt);
    return {
      title: "Ask the validators",
      detail: (
        <>
          Your bond is posted on order {o.id}, but nothing happens until someone presses &ldquo;Ask the validators&rdquo; there. Studio assigns five
          validators; each one that answers in time asks its own model whether the section breaks the promise and whether it keeps it,
          and the word a majority agrees on moves the money in the same transaction.{" "}
          {p.stalePassed ? (
            <>
              The 24 hours after the bond have passed, so anyone may now settle by rule: the seller gets the price and you get only your
              bond back. Press &ldquo;Ask the validators&rdquo; first if you want a verdict.
            </>
          ) : (
            <>
              If no verdict is stored {by ? `by ${by}` : "within 24 hours of the bond"}, anyone can settle by rule: the seller gets the
              price and you get only your bond back.
            </>
          )}
        </>
      ),
      done: false,
      href: `/order/${o.id}`,
      cta: `Open order ${o.id}`,
      here: "Press “Ask the validators” in the dispute box below.",
    };
  }

  if (p?.judged) {
    const o = p.judged;
    if (o.status === "settled_stale") {
      return {
        title: "Settled by rule",
        detail: (
          <>
            Nobody asked the validators within 24 hours of the bond on order {o.id}, so it was settled by rule: the seller got the price
            and the bond went back to the buyer. Dispute another order and press &ldquo;Ask the validators&rdquo; to see a verdict.
          </>
        ),
        done: true,
        href: `/order/${o.id}`,
        cta: `Open order ${o.id}`,
      };
    }
    return {
      title: "The verdict moved the money",
      detail: (
        <>
          Order {o.id}: {o.verdictLine || verdictSentence(o)}
        </>
      ),
      done: true,
      href: `/order/${o.id}`,
      cta: "See the verdict",
    };
  }

  return {
    title: "Ask the validators",
    detail: (
      <>
        After the bond, press &ldquo;Ask the validators&rdquo; on the order. Studio assigns five validators; each one that answers in time asks its
        own model two questions, and code turns the answers into one word. Breaks: your price and bond come back. Keeps: both go to the
        seller. Unclear: the seller keeps the price and your bond comes back.
      </>
    ),
    done: false,
  };
}

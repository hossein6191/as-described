"use client";

// The step-by-step guide a first-time visitor follows. Each step reads live state (wallet,
// balance, register) so the "now" step is always the one that actually comes next; the rest
// are links. Collapsible, remembered per browser; the "?" pill brings it back.

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, CircleDot, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet";
import { contractAddress, isMock } from "@/lib/chain";
import { readItem, writeItem } from "@/lib/browser-store";
import { useLocal } from "@/components/use-local";
import { cn } from "@/lib/utils";

const HIDDEN_KEY = "ad:guide-hidden";

type Step = {
  title: string;
  detail: React.ReactNode;
  done: boolean;
  href?: string;
  action?: string;
  onAction?: () => void;
};

export function StartHere({ className, compact = false }: { className?: string; compact?: boolean }) {
  const w = useWallet();
  const [funding, setFunding] = React.useState(false);
  const hasRegister = useLocal(() => !!contractAddress() || isMock, true);
  const hidden = useLocal(() => readItem(HIDDEN_KEY) === "1", false);
  const hide = (v: boolean) => writeItem(HIDDEN_KEY, v ? "1" : "0");

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

  const connected = !!w.address;
  const funded = connected && w.balanceAtto > 0n;

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
      title: "Pick a side",
      detail: (
        <>
          Buy a demo pack in the <Link href="/shop" className="text-primary underline-offset-4 hover:underline">shop</Link>{" "}
          (1 GEN goes into escrow), or <Link href="/sell" className="text-primary underline-offset-4 hover:underline">sell</Link> a pack of your
          own with promises attached.
        </>
      ),
      done: false,
      href: "/shop",
    },
    {
      title: "Read your pack, then dispute a section",
      detail: (
        <>
          Your order page (under <Link href="/orders" className="text-primary underline-offset-4 hover:underline">My orders</Link>) shows every
          section with a hash check. Pick the section that breaks a promise, post the bond, and ask the validators.
        </>
      ),
      done: false,
      href: "/orders",
    },
    {
      title: "Watch the verdict move the money",
      detail: "Five validators answer with one word. Breaks: your price and bond come back. Keeps: the seller is paid. The ledger shows every case.",
      done: false,
      href: "/ledger",
    },
  ];
  if (!hasRegister) {
    steps.splice(2, 0, {
      title: "Point the site at a register",
      detail: "This site is not connected to a deployed contract yet. Deploy one from your wallet on the Deploy page; it takes one signature.",
      done: false,
      href: "/deploy",
    });
  }
  const now = steps.findIndex((s) => !s.done);

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

  return (
    <section aria-label="How to try As Described" className={cn("rounded-2xl border bg-card p-4 sm:p-6", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Try it in five steps</h2>
          {!compact && (
            <p className="text-sm text-muted-foreground">Two minutes, a test wallet, and one real dispute decided by validators.</p>
          )}
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
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => {
          const isNow = i === now;
          return (
            <li
              key={s.title}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-3 text-sm",
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
                {isNow && <CircleDot className="ml-auto size-3.5 text-primary" aria-label="You are here" />}
              </div>
              {!compact && <p className="text-xs text-muted-foreground">{s.detail}</p>}
              {s.action && s.onAction ? (
                <Button variant={isNow ? "cool" : "outline"} size="sm" onClick={s.onAction} disabled={funding && s.title === "Get test GEN"}>
                  {s.action}
                </Button>
              ) : s.href && !s.done ? (
                <Button variant={isNow ? "cool" : "outline"} size="sm" asChild>
                  <Link href={s.href}>Open</Link>
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

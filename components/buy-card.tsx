"use client";

import { Lock, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type BuyCardProps = {
  title: string;
  /** formatted strings, e.g. "1 GEN" */
  priceLabel: string;
  bondLabel: string;
  windowText: string;
  /** what the button says, e.g. "Pay 1 GEN" */
  payLabel: string;
  onPay?: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** replaces the button (wallet prompt, chain switch, …) */
  gate?: React.ReactNode;
  /** anything under the button: the tx rail, an error, the link to the order */
  children?: React.ReactNode;
  className?: string;
};

/** The glass checkout card, rebuilt: an order summary and one pay button. No card fields. */
export function BuyCard({
  title,
  priceLabel,
  bondLabel,
  windowText,
  payLabel,
  onPay,
  disabled,
  busy,
  gate,
  children,
  className,
}: BuyCardProps) {
  return (
    <div className={cn("w-full max-w-[420px] animate-in fade-in-0 slide-in-from-bottom-4 fill-mode-both duration-500", className)}>
      <Card className="group relative gap-0 overflow-hidden rounded-2xl border-border/50 bg-card/40 py-0 backdrop-blur-md transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10">
        <div className="p-5 sm:p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-foreground">Buy this pack</h3>
            <p className="text-sm text-muted-foreground">The price sits in escrow until the dispute window closes.</p>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Pack</dt>
              <dd className="max-w-[60%] text-right font-medium">{title}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Price</dt>
              <dd className="font-semibold">{priceLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Held in escrow</dt>
              <dd className="inline-flex items-center gap-1">
                <Lock className="size-3.5 text-primary" /> {priceLabel}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Dispute window</dt>
              <dd>{windowText}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Bond you would post to dispute</dt>
              <dd className="text-right">
                {bondLabel}
                <span className="block text-xs text-muted-foreground">you lose it only on a keeps verdict</span>
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            {gate ?? (
              <Button
                type="button"
                variant="cool"
                size="lg"
                className="w-full text-base"
                onClick={onPay}
                disabled={disabled || busy}
              >
                {busy ? "Waiting for the wallet…" : payLabel}
              </Button>
            )}
          </div>

          {children ? <div className="mt-4 space-y-3">{children}</div> : null}

          <p className="mt-4 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-3" />
            Nobody can refuse a refund the validators award.
          </p>
        </div>
      </Card>
    </div>
  );
}

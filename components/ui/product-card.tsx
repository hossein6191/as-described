"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { kindEmoji, kindGradient } from "@/lib/format";
import SmoothButton from "@/components/ui/smooth-button";
import { useMediaQuery } from "@/components/use-read";

export interface ProductCardProps {
  title: string;
  /** recipes | templates | notes | prompts | guide | other — picks the cover gradient and emoji */
  kind: string;
  /** already formatted, e.g. "1 GEN" */
  priceLabel: string;
  /** "Demo", "Not delivered yet", "Closed" … */
  badge?: string;
  badgeTone?: "primary" | "muted" | "warn";
  kept?: number;
  broken?: number;
  unclear?: number;
  sectionCount?: number;
  /** text under the title, e.g. "3 promises · 8 sections" */
  meta?: string;
  onBuy?: () => void;
  buyLabel?: string;
  disabled?: boolean;
  className?: string;
}

// Entrance animations are CSS (tw-animate-css): they run even where requestAnimationFrame is throttled,
// so a card never sits at opacity 0 waiting for a JS frame. motion is kept for the button label swap only.

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Tally({ kept = 0, broken = 0, unclear = 0, className }: { kept?: number; broken?: number; unclear?: number; className?: string }) {
  const parts: React.ReactNode[] = [
    <span key="k" className={kept ? "text-keeps" : undefined}>
      kept {kept}
    </span>,
    <span key="b" className={broken ? "text-breaks" : undefined}>
      broken {broken}
    </span>,
  ];
  if (unclear) parts.push(<span key="u">unclear {unclear}</span>);
  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground", className)}>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden="true">·</span> : null}
          {p}
        </span>
      ))}
    </span>
  );
}

export default function ProductCard({
  title,
  kind,
  priceLabel,
  badge,
  badgeTone = "primary",
  kept = 0,
  broken = 0,
  unclear = 0,
  meta,
  onBuy,
  buyLabel = "Buy",
  disabled,
  className,
}: ProductCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const isHoverDevice = useMediaQuery("(hover: hover) and (pointer: fine)");
  const [isPressed, setIsPressed] = useState(false);

  const handleBuy = () => {
    setIsPressed(true);
    onBuy?.();
    setTimeout(() => setIsPressed(false), 1200);
  };

  return (
    <article
      aria-label={`${title} - ${priceLabel}`}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm",
        "transition-shadow duration-300",
        !shouldReduceMotion && "animate-in fade-in-0 slide-in-from-bottom-4 zoom-in-95 fill-mode-both duration-300",
        isHoverDevice && "hover:shadow-xl hover:shadow-black/30",
        className,
      )}
    >
      {/* Cover: a gradient and the kind's emoji, no photo */}
      <div className="relative aspect-[16/9] overflow-hidden" style={{ backgroundImage: kindGradient(kind) }}>
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex items-center justify-center text-6xl drop-shadow-[0_6px_16px_rgba(0,0,0,0.35)] select-none",
            !shouldReduceMotion && "transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
            isHoverDevice && !shouldReduceMotion && "group-hover:scale-110",
          )}
        >
          {kindEmoji(kind)}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        <span className="absolute right-3 bottom-3 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white/90 capitalize backdrop-blur-sm">
          {kind}
        </span>

        {badge ? (
          <span
            className={cn(
              "absolute top-3 left-3 rounded-full px-2.5 py-1 font-semibold text-xs shadow-sm",
              !shouldReduceMotion && "animate-in fade-in-0 zoom-in-50 fill-mode-both delay-200 duration-300",
              badgeTone === "primary" && "bg-primary text-primary-foreground",
              badgeTone === "muted" && "bg-black/60 text-white backdrop-blur-sm",
              badgeTone === "warn" && "bg-gold text-black",
            )}
            role="status"
          >
            {badge}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-semibold text-foreground text-sm tracking-tight">{title}</h3>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
        <Tally kept={kept} broken={broken} unclear={unclear} />

        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-bold text-foreground text-xl tracking-tight">{priceLabel}</span>
        </div>

        <div className="mt-auto pt-2">
          <SmoothButton
            aria-label={`${buyLabel} ${title}`}
            className="w-full gap-2"
            disabled={disabled || isPressed}
            onClick={handleBuy}
            size="default"
            variant="candy"
            type="button"
          >
            <AnimatePresence initial={false} mode="wait">
              {isPressed ? (
                <motion.span
                  animate={{ opacity: 1, transform: "scale(1)" }}
                  className="flex items-center gap-2"
                  exit={{ opacity: 0, transform: "scale(0.8)" }}
                  initial={{ opacity: 0, transform: "scale(0.8)" }}
                  key="go"
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
                >
                  <CheckIcon /> Opening
                </motion.span>
              ) : (
                <motion.span
                  animate={{ opacity: 1, transform: "scale(1)" }}
                  className="flex items-center gap-2"
                  exit={{ opacity: 0, transform: "scale(0.8)" }}
                  initial={{ opacity: 0, transform: "scale(0.8)" }}
                  key="buy"
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
                >
                  <BagIcon /> {buyLabel}
                </motion.span>
              )}
            </AnimatePresence>
          </SmoothButton>
        </div>
      </div>
    </article>
  );
}

export { ProductCard };

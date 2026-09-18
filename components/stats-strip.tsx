"use client";

import { readStats } from "@/lib/chain";
import { useRead } from "@/components/use-read";
import { ReadBlock } from "@/components/read-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const cells = [
  { key: "listings", label: "Packs listed" },
  { key: "orders", label: "Orders" },
  { key: "kept", label: "Promises kept", tone: "text-keeps" },
  { key: "broken", label: "Promises broken", tone: "text-breaks" },
  { key: "released", label: "Released" },
  { key: "refunded", label: "Refunded" },
] as const;

/** Live numbers from stats(): a skeleton, then the row; a failed read says so and retries. */
export function StatsStrip({ className }: { className?: string }) {
  const state = useRead(() => readStats(), []);
  return (
    <ReadBlock
      state={state}
      skeleton={
        <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6", className)} aria-busy="true">
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
        <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6", className)}>
          {cells.map((c) => (
            <div key={c.key} className="rounded-xl border bg-card p-4">
              <dd className={cn("text-2xl font-semibold tabular-nums", "tone" in c ? c.tone : undefined)}>{s[c.key]}</dd>
              <dt className="mt-1 text-xs text-muted-foreground">{c.label}</dt>
            </div>
          ))}
        </dl>
      )}
    </ReadBlock>
  );
}

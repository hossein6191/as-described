"use client";

import * as React from "react";
import { RefreshCw, WifiOff, Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Shown whenever a read came back from data/snapshot.json instead of Studio. */
export function SnapshotBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-foreground",
        className,
      )}
    >
      <Camera className="size-3.5 shrink-0 text-gold" />
      <span>Showing a snapshot, the network is slow.</span>
    </div>
  );
}

/** A failed read is never "no data". Say the network did not answer and offer a retry. */
export function ReadError({
  onRetry,
  detail,
  className,
  compact,
}: {
  onRetry: () => void;
  detail?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-breaks/40 bg-breaks/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between",
        compact && "p-3 text-xs",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <WifiOff className="mt-0.5 size-4 shrink-0 text-breaks" />
        <div>
          <p className="font-medium">Could not reach the network.</p>
          <p className="text-muted-foreground">
            Studio did not answer in time. Nothing is wrong with your order or your wallet.
            {detail ? <span className="block break-hash font-mono text-[11px] opacity-80">{detail}</span> : null}
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw /> Retry
      </Button>
    </div>
  );
}

/** Generic block skeleton: n lines of a card. */
export function BlockSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border bg-card p-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === 0 ? "w-2/3" : i % 2 ? "w-full" : "w-5/6")} />
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-card">
          <Skeleton className="aspect-[16/9] w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Wraps a read: skeleton while loading, error + retry when it failed, the snapshot banner when the data came from
 * the fallback, and then the children with the data.
 */
export function ReadBlock<T>({
  state,
  skeleton,
  children,
  emptyWhen,
  empty,
}: {
  state: { data: T | null; source: "chain" | "snapshot" | null; loading: boolean; error: string; retry: () => void };
  skeleton: React.ReactNode;
  children: (data: T) => React.ReactNode;
  /** when the read succeeded but there is nothing to show (a real empty list) */
  emptyWhen?: (data: T) => boolean;
  empty?: React.ReactNode;
}) {
  if (state.loading && state.data === null) return <>{skeleton}</>;
  if (state.error && state.data === null) return <ReadError onRetry={state.retry} detail={state.error} />;
  // The read finished and answered null (an id that does not exist): that is the empty state, not a skeleton.
  if (state.data === null) return <>{empty ?? skeleton}</>;
  return (
    <div className="space-y-3">
      {state.source === "snapshot" ? <SnapshotBanner /> : null}
      {state.error ? <ReadError onRetry={state.retry} detail={state.error} compact /> : null}
      {emptyWhen && emptyWhen(state.data) ? empty : children(state.data)}
    </div>
  );
}

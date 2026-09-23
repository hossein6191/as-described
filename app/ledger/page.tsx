"use client";

import { RefreshCw } from "lucide-react";

import { LedgerTable } from "@/components/ledger-table";
import { BlockSkeleton, ReadBlock } from "@/components/read-state";
import { YourRegisterNotice } from "@/components/register-line";
import { StatsStrip } from "@/components/stats-strip";
import { Button } from "@/components/ui/button";
import { useRead } from "@/components/use-read";
import { invalidateReads, readLedger } from "@/lib/chain";

/** The contract's ledger view answers at most this many rows, newest first. */
const LEDGER_ROWS = 50;

export default function LedgerPage() {
  const state = useRead(() => readLedger(LEDGER_ROWS), []);
  // Refresh means a live read: drop the 30 s cache first, or the button hands back the same rows.
  const refresh = () => {
    invalidateReads();
    state.retry();
  };
  return (
    <div className="container-site space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ledger</h1>
          <p className="text-muted-foreground">The latest {LEDGER_ROWS} orders on the register, newest first. No wallet needed.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={state.loading}>
          <RefreshCw className={state.loading ? "animate-spin" : undefined} /> Refresh
        </Button>
      </div>

      <StatsStrip />

      <ReadBlock
        state={state}
        skeleton={
          <div className="space-y-3">
            <BlockSkeleton lines={2} />
            <BlockSkeleton lines={2} />
            <BlockSkeleton lines={2} />
          </div>
        }
        emptyWhen={(rows) => rows.length === 0}
        empty={
          <div className="space-y-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <p>No orders yet. The first buy shows up here.</p>
            <YourRegisterNotice className="justify-center" />
          </div>
        }
      >
        {(rows) => (
          <div className="space-y-3">
            <LedgerTable rows={rows} />
            {rows.length >= LEDGER_ROWS ? (
              <p className="text-xs text-muted-foreground">
                Older orders are not in this list. Each pack&apos;s page lists all of its orders, and every order keeps its own page.
              </p>
            ) : null}
          </div>
        )}
      </ReadBlock>
    </div>
  );
}

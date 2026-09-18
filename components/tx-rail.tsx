"use client";

// Transaction progress rail: PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED,
// with validator vote tiles. The infra agent implements it; pages use exactly this surface.

import * as React from "react";
import type { TxStatus } from "@/lib/chain";

export type TxRailProps = {
  hash: string;
  /** what the tx does, e.g. "Paying 1 GEN into escrow" */
  label?: string;
  /** called once when the tx reaches FINALIZED (or CANCELED / undetermined) with the final status */
  onDone?: (status: TxStatus) => void;
  /** show validator tiles (true for judged calls) */
  showVotes?: boolean;
  className?: string;
};

export function TxRail({ hash, label }: TxRailProps) {
  return (
    <div>
      <p>{label ?? "Transaction"}</p>
      <code>{hash}</code>
    </div>
  );
}

/** Polls txStatus(hash) every 3 s until it is final. Exposes the latest status. */
export function useTxStatus(hash: string | null): TxStatus | null {
  void hash;
  return null;
}

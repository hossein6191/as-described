"use client";

import * as React from "react";

import { write, type TxStatus, type WriteFn } from "@/lib/chain";

export type TxRun = {
  /** the tx being tracked, null when nothing is running; a new start() clears the old one first */
  hash: string | null;
  /** the final status once TxRail reports done */
  final: TxStatus | null;
  /** an error thrown by write() itself (wallet refused, wrong chain, …) */
  error: string;
  sending: boolean;
  start: (fn: WriteFn, args: string[], valueAtto?: bigint) => Promise<string | null>;
  onDone: (s: TxStatus) => void;
  reset: () => void;
};

/**
 * One write at a time. The previous run's hash and result leave the screen the moment a new run starts,
 * so a stale explorer link never sits over a new transaction.
 */
export function useTx(onFinal?: (s: TxStatus, hash: string) => void): TxRun {
  const [hash, setHash] = React.useState<string | null>(null);
  const [final, setFinal] = React.useState<TxStatus | null>(null);
  const [error, setError] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const hashRef = React.useRef<string | null>(null);
  const cb = React.useRef(onFinal);
  React.useEffect(() => {
    cb.current = onFinal;
  });

  const reset = React.useCallback(() => {
    hashRef.current = null;
    setHash(null);
    setFinal(null);
    setError("");
    setSending(false);
  }, []);

  const start = React.useCallback(async (fn: WriteFn, args: string[], valueAtto?: bigint) => {
    reset();
    setSending(true);
    try {
      const h = await write(fn, args, valueAtto);
      hashRef.current = h;
      setHash(h);
      return h;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(cleanWalletError(msg));
      return null;
    } finally {
      setSending(false);
    }
  }, [reset]);

  const onDone = React.useCallback((s: TxStatus) => {
    setFinal(s);
    if (hashRef.current) cb.current?.(s, hashRef.current);
  }, []);

  return { hash, final, error, sending, start, onDone, reset };
}

/** Wallet errors are long JSON; keep the sentence a person can act on. */
export function cleanWalletError(msg: string): string {
  if (!msg) return "The wallet returned an error.";
  if (/user rejected|user denied|rejected the request/i.test(msg)) return "You cancelled the signature in the wallet.";
  if (/insufficient funds/i.test(msg)) return "Not enough test GEN. Use the wallet menu to get 10 test GEN.";
  const m = msg.match(/\[EXPECTED\]\s*([^"}\n]+)/);
  if (m) return m[1].trim();
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}

/** The contract's JSON return, read from the final status. */
export function resultOf(s: TxStatus | null): Record<string, unknown> | null {
  if (!s || !s.result) return null;
  return s.result;
}

/** A plain sentence for a tx that finished without doing what was asked. */
export function failureOf(s: TxStatus | null): string {
  if (!s) return "";
  if (s.undetermined) return "The validators split, nothing was stored. Try again.";
  if (s.status === "CANCELED") return "The transaction was cancelled by the network.";
  const r = s.result;
  if (r && r.ok === false) return String(r.reason ?? "The contract refused this call.");
  if (s.exec === "ERROR") return cleanWalletError(s.message || "The contract refused this call.");
  if (s.applied === false) return "The validators did not accept this transaction. Nothing was stored.";
  return "";
}

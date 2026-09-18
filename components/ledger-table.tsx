"use client";

import Link from "next/link";

import type { LedgerRow } from "@/lib/chain";
import { addressUrl } from "@/lib/chain";
import { ago, gen, short, statusWord } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

const money = (r: LedgerRow) => {
  const b = BigInt(r.paidBuyer || "0");
  const s = BigInt(r.paidSeller || "0");
  if (b === 0n && s === 0n) return r.status === "paid" || r.status === "disputed" || r.status === "missing" ? `${gen(r.priceAtto)} in escrow` : "—";
  const parts: string[] = [];
  if (b > 0n) parts.push(`${gen(b)} → buyer`);
  if (s > 0n) parts.push(`${gen(s)} → seller`);
  return parts.join(", ");
};

// Ledger rows carry judged_at only, so an unjudged row shows its status word instead of a blank cell.
const whenCell = (r: LedgerRow) =>
  r.judgedAt ? ago(r.judgedAt) : r.openedAt ? ago(r.openedAt) : <span className="text-muted-foreground/80">{statusWord(r.status)}</span>;

const dispute = (r: LedgerRow) =>
  r.sectionIndex >= 0 && r.promiseIndex >= 0 ? `section ${r.sectionIndex + 1} vs P${r.promiseIndex + 1}` : "";

/** Every order as a row: a table from md up, stacked cards below. No wallet needed. */
export function LedgerTable({ rows, className, showTitle = true }: { rows: LedgerRow[]; className?: string; showTitle?: boolean }) {
  return (
    <div className={cn("w-full", className)}>
      {/* md+ */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Order</th>
              {showTitle ? <th className="px-3 py-2 font-medium">Pack</th> : null}
              <th className="px-3 py-2 font-medium">Buyer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Dispute</th>
              <th className="px-3 py-2 font-medium">Money</th>
              <th className="px-3 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-3 py-2 font-mono">
                  <Link href={`/order/${r.id}`} className="text-primary underline-offset-4 hover:underline">
                    {r.id}
                  </Link>
                </td>
                {showTitle ? (
                  <td className="max-w-[16rem] px-3 py-2">
                    <Link href={`/pack/${r.listing}`} className="line-clamp-2 underline-offset-4 hover:underline">
                      {r.title || r.listing}
                    </Link>
                  </td>
                ) : null}
                <td className="px-3 py-2 font-mono text-xs">
                  <a href={addressUrl(r.buyer)} target="_blank" rel="noopener noreferrer" className="hover:underline" title={r.buyer}>
                    {short(r.buyer)}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} verdict={r.verdict} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{dispute(r) || "—"}</td>
                <td className="px-3 py-2 text-xs">{money(r)}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{whenCell(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* phones */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border bg-card p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/order/${r.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                {r.id}
              </Link>
              <StatusBadge status={r.status} verdict={r.verdict} />
            </div>
            {showTitle ? (
              <Link href={`/pack/${r.listing}`} className="mt-1 line-clamp-2 block text-foreground underline-offset-4 hover:underline">
                {r.title || r.listing}
              </Link>
            ) : null}
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>Buyer</dt>
              <dd className="font-mono">
                <a href={addressUrl(r.buyer)} target="_blank" rel="noopener noreferrer" title={r.buyer}>
                  {short(r.buyer)}
                </a>
              </dd>
              {dispute(r) ? (
                <>
                  <dt>Dispute</dt>
                  <dd>{dispute(r)}</dd>
                </>
              ) : null}
              <dt>Money</dt>
              <dd className="text-foreground">{money(r)}</dd>
              <dt>When</dt>
              <dd>{whenCell(r)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

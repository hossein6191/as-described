// The route's own browser title (see app/shop/layout.tsx).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ledger",
  description: "The latest orders on the register, newest first, with their verdicts. No wallet needed.",
};

export default function LedgerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

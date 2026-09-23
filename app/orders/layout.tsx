// The route's own browser title (see app/shop/layout.tsx).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My orders",
  description: "Orders paid by the connected wallet, the packs it listed with their sales, and what needs you next.",
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

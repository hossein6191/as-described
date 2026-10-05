// The route's own browser title (see app/shop/layout.tsx). Titled from the route alone, so a
// shared seller link previews as that seller and no chain read is spent on the title; anything
// that is not an address never reaches the tab title.
import type { Metadata } from "next";

const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  return {
    title: isAddress(address) ? `Seller ${address.slice(0, 6)}…${address.slice(-4)}` : "Seller",
    description: "A seller's public record on the register: what they sold, the verdicts, the refunds, and the stake behind their promises.",
  };
}

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

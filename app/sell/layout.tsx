// The route's own browser title (see app/shop/layout.tsx).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sell a pack",
  description: "Write the sections, make promises about them, set a price. The hashes go on chain first, the text is uploaded after.",
};

export default function SellLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// The route's own browser title. A "use client" page cannot export metadata, so each route that
// has one keeps this tiny server layout beside it; the template in app/layout.tsx adds the site name.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop",
  description: "Text packs whose promises are enforced by the contract. Prices in test GEN.",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// The route's own browser title (see app/shop/layout.tsx).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deploy a register",
  description: "Deploy the As Described contract from your own wallet and point this browser at it.",
};

export default function DeployLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { WalletButton } from "@/components/wallet";
import { CHAIN_ID } from "@/lib/chain";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/sell", label: "Sell" },
  { href: "/ledger", label: "Ledger" },
  { href: "/orders", label: "My orders" },
  { href: "/deploy", label: "Deploy" },
] as const;

export function NetworkBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 text-[11px] font-medium whitespace-nowrap text-primary",
        className,
      )}
      title="GenLayer Studio test network"
    >
      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      Studio · {CHAIN_ID}
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container-site flex flex-col gap-2 py-2 sm:h-16 sm:flex-row sm:items-center sm:gap-6 sm:py-0">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 sm:hidden">
            <NetworkBadge />
            <WalletButton />
          </div>
        </div>
        <nav aria-label="Main" className="flex items-center gap-1 overflow-x-auto sm:flex-1">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/") || (n.href === "/shop" && pathname.startsWith("/pack/")) || (n.href === "/orders" && pathname.startsWith("/order/"));
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-accent hover:text-foreground",
                  active ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          <NetworkBadge />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

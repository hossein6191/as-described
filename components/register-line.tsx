"use client";

// The register this browser reads, for the footer: the address, where it came from, and the
// deploy link. Client side, because the choice made on /deploy lives in this browser only.

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { addressUrl, contractAddress } from "@/lib/chain";
import { registerSource, siteRegister } from "@/lib/register";
import { short } from "@/lib/format";
import { useLocal } from "@/components/use-local";

export function RegisterLine() {
  // The server renders the site default; the browser re-reads once its own choice is known.
  const contract = useLocal(() => contractAddress(), siteRegister());
  const yours = useLocal(() => registerSource() === "yours", false);

  return (
    <>
      {contract ? (
        <a
          href={addressUrl(contract)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 break-hash font-mono text-xs text-primary underline-offset-4 hover:underline"
          title={contract}
        >
          {short(contract, 10, 8)}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">
          No register yet.{" "}
          <Link href="/deploy" className="text-primary underline-offset-4 hover:underline">
            Deploy one
          </Link>{" "}
          from your wallet.
        </p>
      )}
      {contract && yours ? (
        <p className="text-xs text-muted-foreground">Your own register, chosen on the Deploy page.</p>
      ) : null}
    </>
  );
}

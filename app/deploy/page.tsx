"use client";

// Deploy your own As Described register from your wallet. The page fetches the contract source
// the site ships (public/contracts/as_described.py, byte-identical to contracts/as_described.py),
// shows its sha256 so anybody can diff it against the repository, and signs one deploy transaction.

import * as React from "react";
import Link from "next/link";
import { Rocket, ExternalLink, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TxRail } from "@/components/tx-rail";
import { useWallet } from "@/components/wallet";
import { sha256Hex } from "@/lib/api";
import { addressUrl, contractAddress, deploy, deployedAddress, type TxStatus } from "@/lib/chain";
import { REPO_URL } from "@/lib/config";

const SOURCE_PATH = "/contracts/as_described.py";

export default function DeployPage() {
  const wallet = useWallet();
  const [code, setCode] = React.useState<string>("");
  const [digest, setDigest] = React.useState<string>("");
  const [loadError, setLoadError] = React.useState<string>("");
  const [address, setAddress] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  // The deploy hash lives in local state; TxRail polls it like any other transaction.
  const [hash, setHash] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(SOURCE_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`the site answered ${res.status}`);
        const text = await res.text();
        if (!alive) return;
        setCode(text);
        setDigest(await sha256Hex(text));
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "could not load the contract source");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onDone = React.useCallback(
    async (s: TxStatus) => {
      if (!hash || s.status === "CANCELED" || s.applied === false) return;
      // The address is on the transaction once the network accepted it.
      for (let i = 0; i < 20; i++) {
        try {
          const a = await deployedAddress(hash);
          if (a) {
            setAddress(a);
            return;
          }
        } catch {
          /* try again */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    },
    [hash],
  );

  const start = async () => {
    setError("");
    setAddress("");
    setBusy(true);
    try {
      setHash(null);
      const h = await deploy(code);
      setHash(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the address is still on screen */
    }
  };

  const configured = contractAddress();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Deploy a register</h1>
        <p className="text-muted-foreground">
          The site ships the contract source it was deployed from. Deploying it from your own wallet gives you a
          register of your own on GenLayer Studio; the address is yours, and the code is the file below, byte for
          byte.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Contract source</h2>
          <a className="text-sm text-primary underline-offset-4 hover:underline" href={SOURCE_PATH} target="_blank" rel="noreferrer">
            contracts/as_described.py
          </a>
        </div>
        {loadError ? (
          <p className="text-sm text-destructive">Could not load the source: {loadError}</p>
        ) : code ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">Size</dt>
            <dd>{code.length.toLocaleString()} characters</dd>
            <dt className="text-muted-foreground">sha256</dt>
            <dd className="break-all font-mono text-xs">{digest}</dd>
            <dt className="text-muted-foreground">Repository</dt>
            <dd>
              <a className="text-primary underline-offset-4 hover:underline" href={REPO_URL} target="_blank" rel="noreferrer">
                {REPO_URL.replace("https://", "")}
              </a>
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Loading the source…</p>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Sign the deployment</h2>
        {!wallet.address ? (
          <p className="text-sm text-muted-foreground">Connect a wallet (top right) on GenLayer Studio, chain 61999, then deploy.</p>
        ) : !wallet.onStudio ? (
          <p className="text-sm text-destructive">Your wallet is not on GenLayer Studio. Switch it first.</p>
        ) : null}
        <Button variant="cool" size="lg" disabled={!code || busy || !wallet.address || !wallet.onStudio} onClick={start}>
          <Rocket /> Deploy from my wallet
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {hash ? <TxRail hash={hash} label="Deploying the register" onDone={onDone} /> : null}
        {address ? (
          <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm font-medium">Deployed. Your register lives at</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-background px-2 py-1 font-mono text-xs">{address}</code>
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={addressUrl(address)} target="_blank" rel="noreferrer">
                  <ExternalLink /> Explorer
                </a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              To point this site at it, set <code className="font-mono text-xs">NEXT_PUBLIC_CONTRACT</code> to this address
              (or <code className="font-mono text-xs">DEMO_CONTRACT</code> in <code className="font-mono text-xs">lib/config.ts</code>) and redeploy the site.
            </p>
          </div>
        ) : null}
      </Card>

      <p className="text-sm text-muted-foreground">
        This site currently reads{" "}
        {configured ? (
          <a className="font-mono text-xs text-primary underline-offset-4 hover:underline" href={addressUrl(configured)} target="_blank" rel="noreferrer">
            {configured}
          </a>
        ) : (
          <span>no register yet</span>
        )}
        . Back to the <Link className="text-primary underline-offset-4 hover:underline" href="/shop">shop</Link>.
      </p>
    </div>
  );
}

"use client";

// Wallet state for the whole site (EIP-6963 discovery, chain 61999 switching, faucet).
// Pages use exactly this surface: WalletProvider, useWallet, WalletButton, WalletState.
//
// Rules this file keeps (each one cost an earlier site a bug report):
// - every announced wallet is listed by name and icon; nothing is picked on the reader's behalf
// - Connect again switches wallets; Disconnect forgets (and tries wallet_revokePermissions)
// - accountsChanged / chainChanged are followed, so the printed address is always the signing one
// - the wrong-chain banner stays until the wallet is on Studio; nothing is signed elsewhere
// - the wallet's own dialog approves fees; never window.confirm

import * as React from "react";
import { Button } from "@/components/ui/button";
import { MetalButton } from "@/components/ui/liquid-glass-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as chain from "@/lib/chain";
import {
  CHAIN_ID,
  LEGACY_RDNS,
  chainName,
  discoverWallets,
  forgetWallet,
  formatGen,
  getChainId,
  isUserRejection,
  legacyProvider,
  personalSign,
  rememberWallet,
  rememberedWallet,
  requestAccount,
  revokePermissions,
  setSigner,
  shortAddress,
  silentAccount,
  switchToStudio as switchProviderToStudio,
  type EIP1193Provider,
  type EIP6963ProviderDetail,
} from "@/lib/wallet";

export type WalletInfo = {
  name: string;
  icon: string; // data URL
  rdns: string;
};

export type WalletState = {
  /** wallets announced through EIP-6963 */
  wallets: WalletInfo[];
  /** connected account, lowercase 0x…, or "" */
  address: string;
  /** the wallet's current chain id (number) or null */
  chainId: number | null;
  /** true when chainId === 61999 */
  onStudio: boolean;
  /** balance in atto, refreshed after every tx and faucet call */
  balanceAtto: bigint;
  connecting: boolean;
  error: string;
  /** open the picker (or connect the only wallet) */
  connect: (rdns?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** wallet_switchEthereumChain 0xf22f, adding the chain if the wallet lacks it */
  switchToStudio: () => Promise<void>;
  /** sim_fundAccount 10 GEN, resolves when the balance moved */
  getTestGen: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  /** personal_sign through the connected provider */
  signMessage: (message: string) => Promise<string>;
};

const noop = async () => {};
const defaultState: WalletState = {
  wallets: [],
  address: "",
  chainId: null,
  onStudio: false,
  balanceAtto: 0n,
  connecting: false,
  error: "",
  connect: noop,
  disconnect: noop,
  switchToStudio: noop,
  getTestGen: noop,
  refreshBalance: noop,
  signMessage: async () => "",
};

const WalletContext = React.createContext<WalletState>(defaultState);

const errorText = (e: unknown, fallback: string) =>
  e && typeof e === "object" && "message" in e && (e as { message?: string }).message
    ? String((e as { message: string }).message)
    : fallback;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [details, setDetails] = React.useState<EIP6963ProviderDetail[]>([]);
  const [address, setAddress] = React.useState("");
  const [chainId, setChainId] = React.useState<number | null>(null);
  const [balanceAtto, setBalanceAtto] = React.useState<bigint>(0n);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // The provider in use and its listeners live in refs: they are not render state.
  const active = React.useRef<{ detail: EIP6963ProviderDetail; off: () => void } | null>(null);
  const reconnected = React.useRef(false);

  const refreshBalanceFor = React.useCallback(async (addr: string) => {
    if (!addr) return;
    try {
      setBalanceAtto(await chain.balanceOf(addr));
    } catch {
      /* a dropped balance read keeps the last number; the next tx refreshes it */
    }
  }, []);

  const clearSession = React.useCallback(() => {
    active.current?.off();
    active.current = null;
    setSigner(null);
    setAddress("");
    setChainId(null);
    setBalanceAtto(0n);
  }, []);

  /** Wires accountsChanged/chainChanged for one provider and returns the unsubscribe. */
  const watch = React.useCallback(
    (detail: EIP6963ProviderDetail) => {
      const p = detail.provider;
      const onAccounts = (...args: unknown[]) => {
        const accounts = (args[0] as string[]) || [];
        if (!accounts.length) {
          // The wallet dropped this site. Forget, without asking the wallet again.
          forgetWallet();
          clearSession();
          return;
        }
        const next = accounts[0].toLowerCase();
        setAddress(next);
        setSigner({ provider: p, address: next, rdns: detail.info.rdns });
        void refreshBalanceFor(next);
      };
      const onChain = (...args: unknown[]) => {
        const hex = String(args[0] ?? "");
        const n = parseInt(hex, 16);
        setChainId(Number.isNaN(n) ? null : n);
      };
      p.on?.("accountsChanged", onAccounts);
      p.on?.("chainChanged", onChain);
      return () => {
        p.removeListener?.("accountsChanged", onAccounts);
        p.removeListener?.("chainChanged", onChain);
      };
    },
    [clearSession, refreshBalanceFor],
  );

  const adopt = React.useCallback(
    async (detail: EIP6963ProviderDetail, addr: string) => {
      active.current?.off();
      active.current = { detail, off: watch(detail) };
      setSigner({ provider: detail.provider, address: addr, rdns: detail.info.rdns });
      setAddress(addr);
      rememberWallet(detail.info.rdns);
      setChainId(await getChainId(detail.provider));
      await refreshBalanceFor(addr);
    },
    [refreshBalanceFor, watch],
  );

  /** Connect through one specific wallet: the wallet asks, then the chain is switched. */
  const connectWith = React.useCallback(
    async (detail: EIP6963ProviderDetail) => {
      setPickerOpen(false);
      setConnecting(true);
      setError("");
      try {
        const addr = await requestAccount(detail.provider);
        if (!addr) throw new Error(`No account came back from ${detail.info.name}.`);
        await adopt(detail, addr);
        try {
          await switchProviderToStudio(detail.provider);
        } catch (e) {
          // Connected, but on another chain: the banner says so and offers the switch again.
          if (!isUserRejection(e)) setError(errorText(e, "The wallet could not switch to GenLayer Studio."));
        }
        setChainId(await getChainId(detail.provider));
      } catch (e) {
        if (isUserRejection(e)) setError("Connection refused in the wallet. Nothing was signed.");
        else setError(errorText(e, `Could not connect through ${detail.info.name}.`));
        clearSession();
      } finally {
        setConnecting(false);
      }
    },
    [adopt, clearSession],
  );

  // EIP-6963 discovery, and the silent reconnect once the remembered wallet announces.
  React.useEffect(() => {
    const stop = discoverWallets((list) => {
      setDetails(list);
      const wanted = rememberedWallet();
      if (reconnected.current || !wanted) return;
      const d = list.find((x) => x.info.rdns === wanted);
      if (!d) return;
      reconnected.current = true;
      void (async () => {
        const addr = await silentAccount(d.provider);
        if (addr) await adopt(d, addr);
      })();
    });
    // A remembered legacy wallet (window.ethereum only) never announces; try it once.
    const wanted = rememberedWallet();
    if (wanted === LEGACY_RDNS && !reconnected.current) {
      const d = legacyProvider();
      if (d) {
        reconnected.current = true;
        void (async () => {
          const addr = await silentAccount(d.provider);
          if (addr) await adopt(d, addr);
        })();
      }
    }
    return () => {
      stop();
      active.current?.off();
      active.current = null;
      setSigner(null);
    };
  }, [adopt]);

  const connect = React.useCallback(
    async (rdns?: string) => {
      setError("");
      const legacy = legacyProvider();
      const choices = details.length ? details : legacy ? [legacy] : [];
      if (!choices.length) {
        setError("No wallet found in this browser. Rabby and MetaMask both work here.");
        return;
      }
      if (rdns) {
        const d = choices.find((x) => x.info.rdns === rdns);
        if (!d) {
          setError("That wallet is not in this browser any more.");
          return;
        }
        await connectWith(d);
        return;
      }
      // One wallet and nobody connected yet is not a choice worth a click. Everything else asks.
      if (choices.length === 1 && !address) {
        await connectWith(choices[0]);
        return;
      }
      setPickerOpen(true);
    },
    [address, connectWith, details],
  );

  const disconnect = React.useCallback(async () => {
    const p = active.current?.detail.provider;
    forgetWallet();
    clearSession();
    setError("");
    if (p) await revokePermissions(p);
  }, [clearSession]);

  const switchToStudio = React.useCallback(async () => {
    const p = active.current?.detail.provider;
    if (!p) {
      setError("Connect a wallet first.");
      return;
    }
    setError("");
    try {
      await switchProviderToStudio(p);
    } catch (e) {
      if (!isUserRejection(e)) setError(errorText(e, "The wallet could not switch to GenLayer Studio."));
    }
    setChainId(await getChainId(p));
  }, []);

  const refreshBalance = React.useCallback(async () => {
    await refreshBalanceFor(address);
  }, [address, refreshBalanceFor]);

  const getTestGen = React.useCallback(async () => {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setError("");
    try {
      setBalanceAtto(await chain.faucet(address));
    } catch (e) {
      setError(errorText(e, "The faucet did not answer."));
      throw e;
    }
  }, [address]);

  const signMessage = React.useCallback(
    async (message: string) => {
      const p: EIP1193Provider | undefined = active.current?.detail.provider;
      if (!p || !address) throw new Error("Connect a wallet first.");
      const id = await getChainId(p);
      if (id !== CHAIN_ID) {
        throw new Error(
          `Your wallet is on ${chainName(id)}. Switch it to GenLayer Studio (chain 61999) before signing.`,
        );
      }
      return personalSign(p, address, message);
    },
    [address],
  );

  const wallets = React.useMemo<WalletInfo[]>(
    () => details.map((d) => ({ name: d.info.name, icon: d.info.icon, rdns: d.info.rdns })),
    [details],
  );

  const value = React.useMemo<WalletState>(
    () => ({
      wallets,
      address,
      chainId,
      onStudio: chainId === CHAIN_ID,
      balanceAtto,
      connecting,
      error,
      connect,
      disconnect,
      switchToStudio,
      getTestGen,
      refreshBalance,
      signMessage,
    }),
    [
      wallets,
      address,
      chainId,
      balanceAtto,
      connecting,
      error,
      connect,
      disconnect,
      switchToStudio,
      getTestGen,
      refreshBalance,
      signMessage,
    ],
  );

  const legacy = details.length ? null : legacyProvider();

  return (
    <WalletContext.Provider value={value}>
      <WrongChainBanner />
      {children}
      <Dialog open={pickerOpen} onOpenChange={(open) => setPickerOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{address ? "Connect a different wallet?" : "Which wallet?"}</DialogTitle>
            <DialogDescription>
              {details.length > 1
                ? `This browser announced ${details.length} wallets. Nothing is signed by choosing; the wallet asks you first.`
                : "Nothing is signed by choosing; the wallet asks you first."}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {details.map((d) => (
              <li key={d.info.rdns}>
                <button
                  type="button"
                  onClick={() => void connectWith(d)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-muted"
                >
                  {d.info.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.info.icon} alt="" aria-hidden="true" className="size-7 rounded" />
                  ) : (
                    <span className="size-7 rounded bg-muted" aria-hidden="true" />
                  )}
                  <span className="flex flex-col">
                    <span className="font-medium">{d.info.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{d.info.rdns}</span>
                  </span>
                </button>
              </li>
            ))}
            {legacy && (
              <li>
                <button
                  type="button"
                  onClick={() => void connectWith(legacy)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="size-7 rounded bg-muted" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="font-medium">The wallet in this browser</span>
                    <span className="text-xs text-muted-foreground">did not announce a name</span>
                  </span>
                </button>
              </li>
            )}
            {!details.length && !legacy && (
              <li className="text-sm text-muted-foreground">
                No wallet found in this browser. Rabby and MetaMask both work here.
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  return React.useContext(WalletContext);
}

/** Shown while a wallet is connected on any chain other than Studio. Persistent on purpose. */
function WrongChainBanner() {
  const w = useWallet();
  if (!w.address || w.onStudio) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-100"
    >
      <span>
        Your wallet is on <strong>{chainName(w.chainId)}</strong>. This site signs only on GenLayer
        Studio (chain 61999).
      </span>
      <Button size="sm" variant="outline" onClick={() => void w.switchToStudio()}>
        Switch to Studio
      </Button>
    </div>
  );
}

/** Header button: shows "Connect wallet", or the short address + balance + a menu (switch chain, test GEN, disconnect). */
export function WalletButton() {
  const w = useWallet();
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [funding, setFunding] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!w.address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="cool" size="sm" disabled={w.connecting} onClick={() => void w.connect()}>
          {w.connecting ? "Connecting…" : "Connect wallet"}
        </Button>
        {w.error && <span className="max-w-64 text-right text-xs text-rose-300">{w.error}</span>}
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(w.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the address is on screen anyway */
    }
  };

  const fund = async () => {
    setFunding(true);
    try {
      await w.getTestGen();
    } catch {
      /* the error is in w.error */
    } finally {
      setFunding(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
      >
        <span
          aria-hidden="true"
          className={"size-2 rounded-full " + (w.onStudio ? "bg-emerald-400" : "bg-amber-400")}
        />
        <span className="font-mono">{shortAddress(w.address)}</span>
        <span className="text-muted-foreground">{formatGen(w.balanceAtto)}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 flex w-64 flex-col gap-1 rounded-lg border border-border bg-popover p-2 text-sm shadow-lg"
        >
          <div className="px-2 py-1 text-xs text-muted-foreground">
            {w.onStudio ? "GenLayer Studio · 61999" : `On ${chainName(w.chainId)}`}
          </div>
          <MenuItem onClick={() => void copy()}>{copied ? "Copied" : "Copy address"}</MenuItem>
          <a
            role="menuitem"
            href={chain.addressUrl(w.address)}
            target="_blank"
            rel="noreferrer"
            className="rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            View on the explorer
          </a>
          {!w.onStudio && (
            <MenuItem onClick={() => void w.switchToStudio()}>Switch to Studio</MenuItem>
          )}
          <div className="px-1 py-1">
            <MetalButton
              variant="gold"
              disabled={funding}
              onClick={() => void fund()}
              className="w-full"
            >
              {funding ? "Waiting for the faucet…" : "Get 10 test GEN"}
            </MetalButton>
          </div>
          <MenuItem
            onClick={() => {
              setOpen(false);
              void w.disconnect();
            }}
          >
            Disconnect
          </MenuItem>
          {w.error && <div className="px-2 py-1 text-xs text-rose-300">{w.error}</div>}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="rounded px-2 py-1.5 text-left hover:bg-muted"
    >
      {children}
    </button>
  );
}

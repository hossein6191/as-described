"use client";

// Wallet state for the whole site (EIP-6963 discovery, chain 61999 switching, faucet).
// The infra agent replaces the bodies; pages use exactly this surface.

import * as React from "react";

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

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return <WalletContext.Provider value={defaultState}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  return React.useContext(WalletContext);
}

/** Header button: shows "Connect wallet", or the short address + balance + a menu (switch chain, test GEN, disconnect). */
export function WalletButton() {
  const w = useWallet();
  return (
    <button type="button" onClick={() => void w.connect()}>
      {w.address ? w.address.slice(0, 6) + "…" + w.address.slice(-4) : "Connect wallet"}
    </button>
  );
}

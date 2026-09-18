// Which register this browser reads and writes.
//
// The site ships one default (NEXT_PUBLIC_CONTRACT, then lib/config DEMO_CONTRACT). A visitor who
// deploys their own register from /deploy, or pastes an address there, overrides it for this
// browser only (localStorage). The delivery API receives the register with every request, so a
// pack uploaded against one register is never served for another.

import { DEMO_CONTRACT } from "./config";
import { readItem, writeItem } from "./browser-store";

export const REGISTER_KEY = "ad:register";
export const LAST_DEPLOY_KEY = "ad:last-deploy";
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const isAddress = (s: string): boolean => ADDRESS_RE.test(s);

/** The site's own default register (env first, then the committed address). */
export const siteRegister = (): string => process.env.NEXT_PUBLIC_CONTRACT || DEMO_CONTRACT || "";

/** The register this browser chose on /deploy, or "" (always "" on the server). */
export function registerOverride(): string {
  const v = readItem(REGISTER_KEY);
  return isAddress(v) ? v : "";
}

export function setRegisterOverride(address: string | null): void {
  writeItem(REGISTER_KEY, address && isAddress(address) ? address : null);
}

export type LastDeploy = { address: string; hash: string; at: string };

/** The raw stored record, "" when none (a string, so it can be a stable store snapshot). */
export const lastDeployRaw = (): string => readItem(LAST_DEPLOY_KEY);

export function parseLastDeploy(raw: string): LastDeploy | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as LastDeploy;
    return d && isAddress(d.address) ? d : null;
  } catch {
    return null;
  }
}

export const lastDeploy = (): LastDeploy | null => parseLastDeploy(lastDeployRaw());

export function rememberDeploy(d: LastDeploy): void {
  writeItem(LAST_DEPLOY_KEY, JSON.stringify(d));
}

/** "yours" when this browser overrode the register, "site" when the shipped default is in use, "none" otherwise. */
export function registerSource(): "yours" | "site" | "none" {
  if (registerOverride()) return "yours";
  return siteRegister() ? "site" : "none";
}

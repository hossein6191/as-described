// Server side: which register a delivery-API request is about.
//
// The browser sends the register it reads (see lib/register.ts) with every request; the routes
// check the chain and key the stored pack by it. Without one, the site's own default applies.
// Under NEXT_PUBLIC_MOCK=1 every request is about the mock register.

import { isMock } from "./chain";
import { siteRegister, isAddress } from "./register";

export const MOCK_REGISTER = "mock";

/** The register named by the request, the site default, or "" when there is none. */
export function registerOf(candidate: unknown): string {
  if (isMock) return MOCK_REGISTER;
  const c = typeof candidate === "string" ? candidate.trim() : "";
  if (c && isAddress(c)) return c;
  return siteRegister();
}

/** The register argument the chain readers take: undefined for the mock, the address otherwise. */
export const chainRegister = (register: string): string | undefined =>
  register === MOCK_REGISTER ? undefined : register;

// The register the site reads when NEXT_PUBLIC_CONTRACT is unset. Filled after the owner deploys
// from their own wallet: one address only, the old one removed rather than kept beside it, and it
// must be a register whose gen_getContractCode hashes to public/contracts/as_described.py, which is
// the file /deploy deploys and the file lib/register-param.ts checks a visitor's register against.
// The address below was deployed on 23 Sep 2026 (tx 0xc39cef54…) from the current file, so the
// bytes on chain and the bytes in this repository are the same and every view the site reads exists.
export const DEMO_CONTRACT = "0x197478dA434994220368cE3e32179B9409f1509D";
export const DEMO_SELLER = "0x0A9fd8Fe0b041974e8F794fCf3Eed352c14cf5fe"; // the owner's seller wallet: its packs get the "Demo" badge
export const SITE_NAME = "As Described";
export const SITE_TAGLINE = "Every promise in the listing is enforced.";
export const REPO_URL = "https://github.com/hossein6191/as-described";

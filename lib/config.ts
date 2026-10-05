// The register the site reads when NEXT_PUBLIC_CONTRACT is unset. Filled after the owner deploys
// from their own wallet: one address only, the old one removed rather than kept beside it, and it
// must be a register whose gen_getContractCode hashes to public/contracts/as_described.py, which is
// the file /deploy deploys and the file lib/register-param.ts checks a visitor's register against.
// The address below is the version 2 register, deployed on 5 Oct 2026 (tx 0x0563fede…) from the
// current file, so the bytes on chain and the bytes in this repository are the same and every view
// the site reads exists. The accepted version 1 register is 0x197478dA434994220368cE3e32179B9409f1509D.
export const DEMO_CONTRACT = "0xE31e77984bce5623AB50c7CB5530a030B9173718";
export const DEMO_SELLER = "0x31bebfCBe0D00e48ADea8E742F821E3a883cD9d2"; // the demo seller: its packs get the "Demo" badge
export const SITE_NAME = "As Described";
export const SITE_TAGLINE = "Every promise in the listing is enforced.";
export const REPO_URL = "https://github.com/hossein6191/as-described";

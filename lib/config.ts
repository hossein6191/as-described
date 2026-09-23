// The register the site reads when NEXT_PUBLIC_CONTRACT is unset. Filled after the owner deploys
// from their own wallet: one address only, the old one removed rather than kept beside it, and it
// must be a register whose gen_getContractCode hashes to public/contracts/as_described.py, which is
// the file /deploy deploys and the file lib/register-param.ts checks a visitor's register against.
// The address below was deployed on 18 Sep 2026 (tx 0xc7f85fe8…) and runs the release of that day,
// so it answers the views the site had then; the current file has since gained revealed[],
// verdict_line, listings() and the stale counter, and every page degrades without them.
export const DEMO_CONTRACT = "0x2f75c3C4854AebF095711510B7075e8f0805966F";
export const DEMO_SELLER = "0x0A9fd8Fe0b041974e8F794fCf3Eed352c14cf5fe"; // the owner's seller wallet: its packs get the "Demo" badge
export const SITE_NAME = "As Described";
export const SITE_TAGLINE = "Every promise in the listing is enforced.";
export const AUTHOR = { name: "Hellish", x: "https://x.com/Hellishnum1" };
export const REPO_URL = "https://github.com/hossein6191/as-described";

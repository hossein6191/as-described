#!/bin/sh
# Local dev server. NEXT_PUBLIC_MOCK=1 by default (no wallet, in-memory data); set NEXT_PUBLIC_MOCK=0 to use the chain.
cd "$(dirname "$0")/.." || exit 1
find .next -name '._*' -delete 2>/dev/null
export NEXT_PUBLIC_MOCK="${NEXT_PUBLIC_MOCK:-1}"
export PACK_SECRET="${PACK_SECRET:-local-dev-secret}"
exec ./node_modules/.bin/next dev -p 3117

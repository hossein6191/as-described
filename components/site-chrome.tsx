"use client";

// What frames a page. Every page of the site sits on the animated background, between the header
// and the footer, inside the wallet and toast providers. /embed/* gets none of that: it is a card
// another website shows in an iframe, where no wallet extension injects and there is nothing to
// sign, so the page renders alone. The path is known while the server renders too, so an embed's
// HTML never carries the chrome, not even for a frame.

import { usePathname } from "next/navigation";

import { Providers } from "@/components/providers";

export const isEmbedPath = (pathname: string | null): boolean => !!pathname && /^\/embed(\/|$)/.test(pathname);

export function SiteChrome({
  background,
  header,
  footer,
  children,
}: {
  background: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isEmbedPath(usePathname())) return <main className="flex-1">{children}</main>;
  return (
    <>
      {background}
      <Providers>
        {header}
        <main className="flex-1">{children}</main>
        {footer}
      </Providers>
    </>
  );
}

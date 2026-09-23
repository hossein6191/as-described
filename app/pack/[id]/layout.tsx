// The route's own browser title (see app/shop/layout.tsx). The id comes from the URL, so it is
// titled from the route alone: no chain read, and a made-up id never reaches the tab title.
import type { Metadata } from "next";

const isListingId = (id: string) => /^L\d{1,9}$/.test(id);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: isListingId(id) ? `Pack ${id}` : "Pack",
    description: "A pack's promises, its price, the sections it commits by hash, and every order on it.",
  };
}

export default function PackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// The route's own browser title (see app/shop/layout.tsx). Titled from the route alone, so a
// shared order link previews as that order and no chain read is spent on the title.
import type { Metadata } from "next";

const isOrderId = (id: string) => /^O\d{1,9}$/.test(id);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: isOrderId(id) ? `Order ${id}` : "Order",
    description: "One order: what is in escrow, the dispute window, the validators' verdict and where the money went.",
  };
}

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

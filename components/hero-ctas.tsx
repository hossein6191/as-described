"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, PenLine } from "lucide-react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { RippleButton } from "@/components/ui/ripple-button";

export function HeroCtas() {
  const router = useRouter();
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
      <LiquidButton asChild size="xl" className="w-full text-base sm:w-auto">
        <Link href="/shop">
          Open the shop <ArrowRight className="size-4" />
        </Link>
      </LiquidButton>
      <RippleButton className="h-12 w-full sm:w-auto" onClick={() => router.push("/sell")}>
        <PenLine className="size-4" /> Sell a pack
      </RippleButton>
    </div>
  );
}

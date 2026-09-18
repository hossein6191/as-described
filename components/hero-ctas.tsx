"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, PenLine } from "lucide-react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { RippleButton } from "@/components/ui/ripple-button";

export function HeroCtas() {
  const router = useRouter();
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
      <LiquidButton size="xl" className="w-full text-base sm:w-auto" onClick={() => router.push("/shop")}>
        Open the shop <ArrowRight className="size-4" />
      </LiquidButton>
      <RippleButton className="h-12 w-full sm:w-auto" onClick={() => router.push("/sell")}>
        <PenLine className="size-4" /> Sell a pack
      </RippleButton>
    </div>
  );
}

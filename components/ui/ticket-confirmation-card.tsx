"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { orderNo, short, when } from "@/lib/format";

const CheckCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const WalletGlyph = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="24" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="17" cy="14.5" r="1.4" fill="currentColor" />
  </svg>
);

const DashedLine = () => <div className="w-full border-t-2 border-dashed border-border" aria-hidden="true" />;

const Barcode = ({ value }: { value: string }) => {
  const hashCode = (s: string) =>
    s.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
  const seed = hashCode(value);
  const random = (s: number) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };

  const bars = Array.from({ length: 60 }).map((_, index) => {
    const rand = random(seed + index);
    return { width: rand > 0.7 ? 2.5 : 1.5 };
  });

  const spacing = 1.5;
  const totalWidth = bars.reduce((acc, bar) => acc + bar.width + spacing, 0) - spacing;
  const svgWidth = 250;
  const svgHeight = 70;
  let currentX = (svgWidth - totalWidth) / 2;

  return (
    <div className="flex w-full flex-col items-center py-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        aria-label={`Barcode for ${value}`}
        className="max-w-[250px] fill-current text-foreground"
      >
        {bars.map((bar, index) => {
          const x = currentX;
          currentX += bar.width + spacing;
          return <rect key={index} x={x} y="10" width={bar.width} height="50" />;
        })}
      </svg>
      <p className="mt-2 max-w-full font-mono text-xs tracking-[0.2em] text-muted-foreground" title={value}>
        {value.length > 22 ? short(value, 10, 8) : value}
      </p>
    </div>
  );
};

const ConfettiExplosion = () => {
  const confettiCount = 90;
  const colors = ["#19c6a6", "#f5b301", "#3ddc97", "#f2f4f6", "#7c5cff", "#f4506a"];
  // Deterministic layout so the server and the client render the same markup.
  const pieces = React.useMemo(
    () =>
      Array.from({ length: confettiCount }).map((_, i) => {
        const r = (n: number) => {
          const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          left: r(1) * 100,
          top: -20 + r(2) * 10,
          rotate: r(3) * 360,
          duration: 2.5 + r(4) * 2.5,
          delay: r(5) * 2,
          color: colors[i % colors.length],
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <>
      <style>{`
        @keyframes ad-confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        {pieces.map((p, i) => (
          <div
            key={i}
            className="absolute h-4 w-2"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              backgroundColor: p.color,
              transform: `rotate(${p.rotate}deg)`,
              animation: `ad-confetti-fall ${p.duration}s ${p.delay}s linear forwards`,
            }}
          />
        ))}
      </div>
    </>
  );
};

export interface TicketProps extends React.HTMLAttributes<HTMLDivElement> {
  orderId: string;
  /** already formatted, e.g. "1 GEN" */
  amountGen: string;
  date: Date | string;
  /** the wallet that paid */
  address: string;
  /** tx hash (or the order id when there is none) */
  barcodeValue: string;
  heading?: string;
  subheading?: string;
  /** rain confetti once on mount */
  confetti?: boolean;
  /** what the address line is called, default "Paid by" */
  addressLabel?: string;
  icon?: React.ReactNode;
}

const AnimatedTicket = React.forwardRef<HTMLDivElement, TicketProps>(
  (
    {
      className,
      orderId,
      amountGen,
      date,
      address,
      barcodeValue,
      heading = "Thank you!",
      subheading = "Your order is in escrow",
      confetti = false,
      addressLabel = "Paid by",
      icon,
      ...props
    },
    ref,
  ) => {
    const [showConfetti, setShowConfetti] = React.useState(false);

    React.useEffect(() => {
      if (!confetti) return;
      const mountTimer = setTimeout(() => setShowConfetti(true), 100);
      const unmountTimer = setTimeout(() => setShowConfetti(false), 6000);
      return () => {
        clearTimeout(mountTimer);
        clearTimeout(unmountTimer);
      };
    }, [confetti]);

    const iso = typeof date === "string" ? date : date.toISOString();

    return (
      <>
        {showConfetti && <ConfettiExplosion />}
        <div
          ref={ref}
          className={cn(
            "relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-card font-sans text-card-foreground shadow-lg ring-1 ring-foreground/10",
            "animate-in fade-in-0 zoom-in-95 duration-500",
            className,
          )}
          {...props}
        >
          {/* Ticket cut-outs */}
          <div className="absolute top-1/2 -left-4 h-8 w-8 -translate-y-1/2 rounded-full bg-background" />
          <div className="absolute top-1/2 -right-4 h-8 w-8 -translate-y-1/2 rounded-full bg-background" />

          <div className="flex flex-col items-center p-6 text-center sm:p-8">
            <div className="rounded-full bg-primary/10 p-3 animate-in zoom-in-50 delay-300 duration-500">
              {icon ?? <CheckCircleIcon className="h-10 w-10 text-primary animate-in zoom-in-75 delay-500 duration-500" />}
            </div>
            <h2 className="mt-4 text-2xl font-semibold">{heading}</h2>
            <p className="mt-1 text-muted-foreground">{subheading}</p>
          </div>

          <div className="space-y-5 px-6 pb-6 sm:px-8 sm:pb-8">
            <DashedLine />

            <div className="grid grid-cols-2 gap-4 text-left">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Order</p>
                <p className="font-mono font-medium">{orderNo(orderId)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase">Amount</p>
                <p className="text-lg font-semibold">{amountGen}</p>
              </div>
            </div>

            <div className="text-left">
              <p className="text-xs text-muted-foreground uppercase">Date &amp; time</p>
              <p className="font-medium">{when(iso) || "—"}</p>
            </div>

            <div className="flex items-center space-x-4 rounded-lg bg-muted/50 p-4 text-left">
              <WalletGlyph className="shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase">{addressLabel}</p>
                <p className="break-hash font-mono text-sm tracking-wider" title={address}>
                  {short(address, 8, 6)}
                </p>
              </div>
            </div>

            <DashedLine />

            <Barcode value={barcodeValue} />
          </div>
        </div>
      </>
    );
  },
);
AnimatedTicket.displayName = "AnimatedTicket";

export { AnimatedTicket };

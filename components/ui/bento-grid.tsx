import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@radix-ui/react-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type BentoIcon = React.ComponentType<{ className?: string }>;

const BentoGrid = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[18rem] lg:grid-cols-3", className)}>
    {children}
  </div>
);

export type BentoCardProps = {
  name: string;
  className?: string;
  background?: ReactNode;
  Icon: BentoIcon;
  description: string;
  href?: string;
  cta?: string;
  /** small label in the corner, e.g. the step number */
  step?: string;
};

const BentoCard = ({ name, className, background, Icon, description, href, cta, step }: BentoCardProps) => (
  <div
    className={cn(
      "group relative flex min-h-[13rem] flex-col justify-between overflow-hidden rounded-xl",
      "bg-card ring-1 ring-foreground/10 transform-gpu dark:[box-shadow:0_-20px_80px_-20px_#19c6a61a_inset]",
      className,
    )}
  >
    {background ? <div className="pointer-events-none absolute inset-0">{background}</div> : null}
    {step ? (
      <span className="absolute top-4 right-4 font-mono text-xs text-muted-foreground">{step}</span>
    ) : null}
    <div
      className={cn(
        "pointer-events-none z-10 flex transform-gpu flex-col gap-1 p-6 transition-all duration-300",
        href && "group-hover:-translate-y-8",
      )}
    >
      <Icon className="h-10 w-10 origin-left transform-gpu text-primary transition-all duration-300 ease-in-out group-hover:scale-90" />
      <h3 className="mt-2 text-lg font-semibold text-foreground">{name}</h3>
      <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
    </div>

    {href && cta ? (
      <div className="pointer-events-none absolute bottom-0 flex w-full translate-y-8 transform-gpu flex-row items-center p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <Button variant="ghost" asChild size="sm" className="pointer-events-auto">
          <Link href={href}>
            {cta}
            <ArrowRightIcon className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    ) : null}
    <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-primary/[.04]" />
  </div>
);

export { BentoCard, BentoGrid };

"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ActionsProps = ComponentProps<"div">;

export const Actions = ({ className, children, ...props }: ActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type ActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const Action = ({ tooltip, children, label, className, variant = "ghost", size = "sm", asChild, ...props }: ActionProps) => {
  // With asChild the Slot needs exactly one child, so the name goes on aria-label instead of a hidden span.
  const button = asChild ? (
    <Button
      className={cn("size-9 p-1.5 text-muted-foreground hover:text-foreground", className)}
      size={size}
      variant={variant}
      asChild
      aria-label={label || tooltip}
      {...props}
    >
      {children}
    </Button>
  ) : (
    <Button
      className={cn("size-9 p-1.5 text-muted-foreground hover:text-foreground", className)}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

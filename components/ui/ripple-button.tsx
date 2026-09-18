"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

type Ripple = { x: number; y: number; size: number; key: number; isLeaving?: boolean };

export type RippleButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/** A dashed-border button whose fill follows the pointer in. Colors come from the site tokens. */
export const RippleButton = React.forwardRef<HTMLButtonElement, RippleButtonProps>(
  ({ children, className, onMouseEnter, onMouseLeave, onMouseMove, ...props }, forwardedRef) => {
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const [ripple, setRipple] = React.useState<Ripple | null>(null);
    const [isHovered, setIsHovered] = React.useState(false);

    const setRefs = (node: HTMLButtonElement | null) => {
      buttonRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    const pointAt = (event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = buttonRef.current!.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        size: Math.max(rect.width, rect.height) * 2,
      };
    };

    const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isHovered || !buttonRef.current) return;
      setIsHovered(true);
      setRipple({ ...pointAt(event), key: Date.now() });
    };

    const removeRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!buttonRef.current) return;
      setIsHovered(false);
      setRipple({ ...pointAt(event), key: Date.now(), isLeaving: true });
    };

    const handleMouseMove = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!buttonRef.current || !isHovered || !ripple) return;
      const { x, y } = pointAt(event);
      setRipple((prev) => (prev ? { ...prev, x, y } : prev));
    };

    return (
      <button
        ref={setRefs}
        type="button"
        className={cn(
          "relative flex cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-foreground/40 px-8 py-3 text-base font-medium text-foreground shadow-sm transition-colors duration-[600ms] hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        onMouseEnter={(e) => {
          if (e.target === e.currentTarget) createRipple(e);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          if (e.target === e.currentTarget) removeRipple(e);
          onMouseLeave?.(e);
        }}
        onMouseMove={(e) => {
          handleMouseMove(e);
          onMouseMove?.(e);
        }}
        {...props}
      >
        <span className="relative z-[2] flex items-center gap-2">{children}</span>

        <AnimatePresence>
          {ripple && (
            <motion.span
              key={ripple.key}
              className="pointer-events-none absolute z-[1] rounded-full bg-primary"
              style={{ width: ripple.size, height: ripple.size, left: ripple.x, top: ripple.y, x: "-50%", y: "-50%" }}
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: ripple.isLeaving ? 0 : 1, x: "-50%", y: "-50%" }}
              exit={{ scale: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              onAnimationComplete={() => {
                if (ripple.isLeaving) setRipple(null);
              }}
            />
          )}
        </AnimatePresence>
      </button>
    );
  },
);
RippleButton.displayName = "RippleButton";

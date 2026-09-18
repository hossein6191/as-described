import { cn } from "@/lib/utils";

/** The listing's promises as numbered pills (P1…), the numbering the contract uses. */
export function PromisePills({
  promises,
  className,
  highlight,
}: {
  promises: string[];
  className?: string;
  /** 0-based index to mark */
  highlight?: number;
}) {
  return (
    <ol className={cn("flex flex-col gap-2", className)}>
      {promises.map((p, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-3 rounded-xl border bg-card px-3 py-2 text-sm",
            highlight === i && "border-gold/60 bg-gold/10",
          )}
        >
          <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-gold/15 px-2 font-mono text-[11px] font-semibold text-gold">
            P{i + 1}
          </span>
          <span className="break-words">{p}</span>
        </li>
      ))}
    </ol>
  );
}

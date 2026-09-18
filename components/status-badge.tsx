import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const tone = (status: string, verdict?: string) => {
  if (status === "settled") {
    if (verdict === "breaks") return "border-breaks/50 bg-breaks/15 text-breaks";
    if (verdict === "keeps") return "border-keeps/50 bg-keeps/15 text-keeps";
    return "border-gold/50 bg-gold/15 text-gold";
  }
  if (status === "refunded") return "border-breaks/50 bg-breaks/15 text-breaks";
  if (status === "released") return "border-keeps/50 bg-keeps/15 text-keeps";
  if (status === "disputed" || status === "missing") return "border-gold/50 bg-gold/15 text-gold";
  if (status === "settled_stale") return "border-border bg-muted text-muted-foreground";
  return "border-primary/40 bg-primary/10 text-primary";
};

export function StatusBadge({ status, verdict, className }: { status: string; verdict?: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("h-auto whitespace-normal py-0.5", tone(status, verdict), className)}>
      {statusLabel(status, verdict)}
    </Badge>
  );
}

export function VerdictBadge({ verdict, className }: { verdict: string; className?: string }) {
  if (!verdict) return null;
  const cls =
    verdict === "breaks"
      ? "border-breaks/50 bg-breaks/15 text-breaks"
      : verdict === "keeps"
        ? "border-keeps/50 bg-keeps/15 text-keeps"
        : "border-gold/50 bg-gold/15 text-gold";
  return (
    <Badge variant="outline" className={cn(cls, className)}>
      {verdict}
    </Badge>
  );
}

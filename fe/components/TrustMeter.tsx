import { cn } from "@/lib/utils";

interface TrustMeterProps {
  score: number; // 0.0 to 100.0
  className?: string;
  showLabel?: boolean;
}

export function TrustMeter({ score, className, showLabel = true }: TrustMeterProps) {
  const normalizedScore = Math.max(0, Math.min(100, score));
  const segments = 20; // Each segment is 5 points
  const activeSegments = Math.round((normalizedScore / 100) * segments);

  let colorClass = "bg-primary";
  let textColorClass = "text-primary";
  
  if (normalizedScore < 35) {
    colorClass = "bg-destructive";
    textColorClass = "text-destructive";
  } else if (normalizedScore < 50) {
    colorClass = "bg-warning";
    textColorClass = "text-warning";
  }

  return (
    <div className={cn("flex flex-col gap-1 font-mono", className)}>
      {showLabel && (
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Trust</span>
          <span className={textColorClass}>{normalizedScore.toFixed(1)}</span>
        </div>
      )}
      <div className="flex gap-[2px]">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3 w-1.5 rounded-[1px] transition-colors",
              i < activeSegments ? colorClass : "bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}

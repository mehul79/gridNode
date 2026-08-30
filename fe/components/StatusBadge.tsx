import { cn } from "@/lib/utils";

const statusConfig: Record<string, { color: string; textColor: string; label: string }> = {
  draft: { color: "bg-muted-foreground", textColor: "text-muted-foreground", label: "DRAFT" },
  pending_approval: { color: "bg-warning", textColor: "text-warning", label: "PENDING_APPROVAL" },
  approved: { color: "bg-primary", textColor: "text-primary", label: "APPROVED" },
  rejected: { color: "bg-destructive", textColor: "text-destructive", label: "REJECTED" },
  queued: { color: "bg-warning", textColor: "text-warning", label: "QUEUED" },
  assigned: { color: "bg-primary", textColor: "text-primary", label: "ASSIGNED" },
  running: { color: "bg-primary", textColor: "text-primary", label: "RUNNING" },
  completed: { color: "bg-primary", textColor: "text-primary", label: "COMPLETED" },
  failed: { color: "bg-destructive", textColor: "text-destructive", label: "FAILED" },
  preempted: { color: "bg-warning", textColor: "text-warning", label: "PREEMPTED" },
  cancelled: { color: "bg-muted-foreground", textColor: "text-muted-foreground", label: "CANCELLED" },
  
  // Machine statuses
  idle: { color: "bg-muted-foreground", textColor: "text-muted-foreground", label: "IDLE" },
  offline: { color: "bg-destructive", textColor: "text-destructive", label: "OFFLINE" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const config = statusConfig[normalizedStatus] || { 
    color: "bg-muted-foreground", 
    textColor: "text-muted-foreground", 
    label: status.toUpperCase() 
  };
  
  const isGlowing = normalizedStatus === "running" || normalizedStatus === "queued" || normalizedStatus === "pending_approval";

  return (
    <div className={cn("inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider", className)}>
      <div className="relative flex h-2 w-2 items-center justify-center">
        {isGlowing && (
          <div className={cn("absolute h-full w-full animate-ping rounded-full opacity-40", config.color)} />
        )}
        <div className={cn("h-1.5 w-1.5 rounded-none", config.color)} />
      </div>
      <span className={cn(config.textColor)}>[{config.label}]</span>
    </div>
  );
}

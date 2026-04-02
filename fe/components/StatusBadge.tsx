import { Badge } from "./ui/badge";
import { JobStatus } from "@/types/api";

const statusConfig: Record<JobStatus, { variant: "default" | "destructive" | "outline" | "success" | "warning" | "info"; label: string }> = {
  draft: { variant: "outline", label: "Draft" },
  pending_approval: { variant: "warning", label: "Pending Approval" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
  queued: { variant: "info", label: "Queued" },
  assigned: { variant: "info", label: "Assigned" },
  running: { variant: "default", label: "Running" },
  completed: { variant: "success", label: "Completed" },
  failed: { variant: "destructive", label: "Failed" },
  preempted: { variant: "destructive", label: "Preempted" },
  cancelled: { variant: "destructive", label: "Cancelled" },
};

interface StatusBadgeProps {
  status: JobStatus;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { variant: "outline" as const, label: status };
  return <Badge variant={config.variant} className={className}>{config.label}</Badge>;
}

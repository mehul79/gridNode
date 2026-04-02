import { JobStatus } from "@prisma/client";

const terminal: JobStatus[] = [
  JobStatus.completed,
  JobStatus.failed,
  JobStatus.preempted,
  JobStatus.cancelled,
  JobStatus.rejected,
];

export function isTerminalStatus(status: JobStatus): boolean {
  return terminal.includes(status);
}

/** Allowed transitions (scheduler and APIs may set additional edges). */
const transitions: Partial<Record<JobStatus, JobStatus[]>> = {
  [JobStatus.draft]: [JobStatus.pending_approval],
  [JobStatus.pending_approval]: [JobStatus.approved, JobStatus.rejected],
  [JobStatus.approved]: [JobStatus.queued],
  [JobStatus.queued]: [JobStatus.assigned],
  [JobStatus.assigned]: [JobStatus.running, JobStatus.failed],
  [JobStatus.running]: [
    JobStatus.completed,
    JobStatus.failed,
    JobStatus.preempted,
    JobStatus.cancelled,
  ],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;
  if (to === JobStatus.cancelled || to === JobStatus.preempted) {
    return !isTerminalStatus(from);
  }
  const allowed = transitions[from];
  return allowed?.includes(to) ?? false;
}

export function canStop(status: JobStatus): boolean {
  if (isTerminalStatus(status)) return false;
  return true;
}

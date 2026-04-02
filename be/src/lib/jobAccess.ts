import { Job, JobStatus } from "@prisma/client";
import { prisma } from "./db";
import { isOwnerOrAdminRole } from "../middleware/requireRole";

/** Machine may be a full row or only `{ ownerId }` from a select. */
type JobWithMachineOwner = Job & { machine?: { ownerId: string } | null };

export async function getUserRole(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return u?.role ?? "requester";
}

export async function canViewJob(
  userId: string,
  role: string,
  job: JobWithMachineOwner
): Promise<boolean> {
  if (job.requesterId === userId) return true;
  if (job.ownerId === userId) return true;
  if (job.machineId) {
    const ownerId =
      job.machine?.ownerId ??
      (await prisma.machine.findUnique({ where: { id: job.machineId }, select: { ownerId: true } }))
        ?.ownerId;
    if (ownerId === userId) return true;
  }
  if (isOwnerOrAdminRole(role) && job.status === JobStatus.pending_approval) return true;
  return false;
}

/** Requester may cancel own job; owners may preempt jobs they own or that run on their machine. */
export async function canStopJob(
  userId: string,
  role: string,
  job: JobWithMachineOwner
): Promise<boolean> {
  if (job.requesterId === userId) return true;
  if (!isOwnerOrAdminRole(role)) return false;
  if (job.ownerId === userId) return true;
  if (job.machineId) {
    const ownerId =
      job.machine?.ownerId ??
      (await prisma.machine.findUnique({ where: { id: job.machineId }, select: { ownerId: true } }))
        ?.ownerId;
    if (ownerId === userId) return true;
  }
  return false;
}

export function resolveStopTargetStatus(job: Job, actorUserId: string): JobStatus {
  if (job.requesterId === actorUserId) return JobStatus.cancelled;
  return JobStatus.preempted;
}

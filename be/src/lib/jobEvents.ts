import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function appendJobEvent(
  jobId: string,
  type: string,
  payload?: Prisma.InputJsonValue,
  actorId?: string | null
) {
  const data: Prisma.JobEventUncheckedCreateInput = {
    jobId,
    type,
  };
  if (payload !== undefined) {
    data.payload = payload;
  }
  if (actorId !== undefined && actorId !== null) {
    data.actorId = actorId;
  }
  return prisma.jobEvent.create({ data });
}

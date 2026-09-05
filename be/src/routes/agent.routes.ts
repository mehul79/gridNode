import { Router } from "express";
import { JobStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { requireAgentAuth } from "../middleware/requireAgentAuth";

const router = Router();

// GET /api/agent/jobs/next — agent polls for a job to run
//
// A job may only be claimed by a machine belonging to the user who approved it
// (job.providerId). Without that check, a job whose machineId was cleared —
// which happens when an agent defers it back to `queued` — could be picked up
// and executed by a machine the requester's counterparty never approved.
router.get("/jobs/next", requireAgentAuth, async (req, res) => {
  try {
    const agentSession = (req as any).agentSession;
    const machine = agentSession.machine;

    if (machine.status === "reclaimed") {
      return res.status(204).end();
    }

    const claimable: Prisma.JobWhereInput = {
      status: { in: [JobStatus.approved, JobStatus.queued] },
      providerId: machine.ownerId,
      OR: [{ machineId: null }, { machineId: agentSession.machineId }],
    };

    const job = await prisma.job.findFirst({
      where: claimable,
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!job) {
      return res.status(204).end();
    }

    // Compare-and-set: another agent owned by the same user may be polling
    // concurrently, so only the request that actually moves the row wins.
    const claimed = await prisma.job.updateMany({
      where: { AND: [{ id: job.id }, claimable] },
      data: { status: JobStatus.assigned, machineId: agentSession.machineId },
    });

    if (claimed.count === 0) {
      return res.status(204).end();
    }

    const updatedJob = await prisma.job.findUnique({
      where: { id: job.id },
      include: { requester: { select: { name: true, email: true } } },
    });

    console.log(`[Polling] Job ${job.id} assigned to machine ${agentSession.machineId}`);

    res.json({ job: updatedJob });
  } catch (err) {
    console.error("[Polling] Error:", err);
    res.status(500).json({ error: "Failed to fetch next job" });
  }
});


router.get("/kaggle-credentials", requireAgentAuth, async (req, res) => {
  const KAGGLE_USERNAME = process.env.KAGGLE_USERNAME;
  const KAGGLE_API_TOKEN = process.env.KAGGLE_API_TOKEN;

  if(!KAGGLE_API_TOKEN || !KAGGLE_USERNAME) return res.status(503).json({
    error: `Kaggle credentials not configured on this platform.`
  })
  return res.json({
    username: KAGGLE_USERNAME,
    key: KAGGLE_API_TOKEN
  })
})

export default router;

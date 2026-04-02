import { Request, Router } from "express";
import { JobType, JobStatus, ApprovalStatus, Prisma } from "@prisma/client";
import { requireAuth } from "../middleware/requireAuth";
import { requireAgentAuth } from "../middleware/requireAgentAuth";
import { prisma } from "../lib/db";
import { appendJobEvent } from "../lib/jobEvents";
import { canStop } from "../lib/jobStatus";
import { canViewJob, canStopJob, getUserRole, resolveStopTargetStatus } from "../lib/jobAccess";
import { emitLog, emitJobUpdate } from "../sockets";

const router = Router();

function paramId(req: Request): string {
  return String(req.params.id);
}

function parseLimit(raw: unknown, fallback: number, max: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// GET /api/jobs
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const role = await getUserRole(user.id);
    const statusParam = req.query.status as string | undefined;

    const statusFilter = statusParam
      ? (Object.values(JobStatus) as string[]).includes(statusParam)
        ? (statusParam as JobStatus)
        : undefined
      : undefined;

    const where: Prisma.JobWhereInput =
      role === "owner" || role === "admin"
        ? {
            OR: [
              { requesterId: user.id },
              { ownerId: user.id },
              { machine: { ownerId: user.id } },
              { status: JobStatus.pending_approval },
            ],
          }
        : { requesterId: user.id };

    const jobs = await prisma.job.findMany({
      where: statusFilter ? { AND: [where, { status: statusFilter }] } : where,
      orderBy: { createdAt: "desc" },
      include: {
        approval: true,
        machine: { select: { id: true, ownerId: true, status: true } },
        _count: { select: { logs: true, artifacts: true } },
      },
    });

    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

// POST /api/jobs
router.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;

    const {
      type = JobType.notebook,
      repoUrl,
      command,
      notebookPath,
      datasetUri,
      cpuRequired,
      memoryRequired,
      gpuRequired,
      timeoutSeconds,
    } = req.body;

    if (!repoUrl || typeof repoUrl !== "string") {
      return res.status(400).json({ error: "repoUrl is required" });
    }
    if (
      cpuRequired == null ||
      memoryRequired == null ||
      gpuRequired == null ||
      typeof cpuRequired !== "number" ||
      typeof memoryRequired !== "number" ||
      typeof gpuRequired !== "number"
    ) {
      return res.status(400).json({ error: "cpuRequired, memoryRequired, gpuRequired are required" });
    }

    const jobType = type === JobType.video ? JobType.video : JobType.notebook;
    if (jobType === JobType.notebook && (!notebookPath || typeof notebookPath !== "string")) {
      return res.status(400).json({ error: "notebookPath is required for notebook jobs" });
    }
    if (jobType === JobType.video && (!command || typeof command !== "string" || !command.trim())) {
      return res.status(400).json({ error: "command is required for video jobs" });
    }

    const job = await prisma.job.create({
      data: {
        requesterId: user.id,
        type: jobType,
        repoUrl,
        command: command ?? null,
        notebookPath: notebookPath ?? null,
        datasetUri: datasetUri ?? null,
        cpuRequired,
        memoryRequired,
        gpuRequired,
        timeoutSeconds:
          typeof timeoutSeconds === "number" && timeoutSeconds > 0 ? timeoutSeconds : 3600,
        status: JobStatus.pending_approval,
        approval: {
          create: { status: ApprovalStatus.pending },
        },
        events: {
          create: {
            type: "job_created",
            payload: { repoUrl, type: jobType } as Prisma.InputJsonValue,
            actorId: user.id,
          },
        },
      },
      include: {
        approval: true,
        machine: { select: { id: true, ownerId: true, status: true } },
        _count: { select: { logs: true, artifacts: true } },
      },
    });

    emitJobUpdate(job.id, { status: job.status, jobId: job.id });
    res.status(201).json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

// GET /api/jobs/:id/logs
router.get("/:id/logs", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = paramId(req);
    const role = await getUserRole(user.id);

    const job = await prisma.job.findUnique({
      where: { id },
      include: { machine: true },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(user.id, role, job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const afterSequence = parseInt(String(req.query.afterSequence ?? "0"), 10) || 0;
    const limit = parseLimit(req.query.limit, 100, 500);

    const logs = await prisma.jobLog.findMany({
      where: { jobId: id, sequence: { gt: afterSequence } },
      orderBy: { sequence: "asc" },
      take: limit,
    });

    const last = logs[logs.length - 1];
    res.json({
      logs,
      nextAfterSequence: last ? last.sequence : afterSequence,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// POST /api/jobs/:id/logs — agent
router.post("/:id/logs", requireAgentAuth, async (req, res) => {
  try {
    const jobId = paramId(req);
    const agentSession = (req as any).agentSession;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.machineId !== agentSession.machineId) {
      return res.status(403).json({ error: "Job not assigned to this machine" });
    }

    const { lines } = req.body as { lines?: { line: string; stream?: string }[] };
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "lines[] required" });
    }
    if (lines.length > 500) {
      return res.status(400).json({ error: "Too many lines per request" });
    }

    const created = await prisma.$transaction(async (tx) => {
      const last = await tx.jobLog.findFirst({
        where: { jobId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      let seq = (last?.sequence ?? 0) + 1;
      const out: { sequence: number; line: string; stream: string | null }[] = [];
      for (const row of lines) {
        if (!row?.line || typeof row.line !== "string") continue;
        const log = await tx.jobLog.create({
          data: {
            jobId,
            sequence: seq,
            line: row.line,
            stream: row.stream ?? null,
          },
        });
        out.push({ sequence: log.sequence, line: log.line, stream: log.stream });
        seq += 1;
      }
      return out;
    });

    for (const row of created) {
      emitLog(jobId, row.line);
    }

    res.status(201).json({ inserted: created.length, lines: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to append logs" });
  }
});

// GET /api/jobs/:id/artifacts
router.get("/:id/artifacts", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = paramId(req);
    const role = await getUserRole(user.id);

    const job = await prisma.job.findUnique({
      where: { id },
      include: { machine: true },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(user.id, role, job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const artifacts = await prisma.artifact.findMany({
      where: { jobId: id },
      orderBy: { createdAt: "asc" },
    });
    res.json(artifacts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list artifacts" });
  }
});

// POST /api/jobs/:id/artifacts — agent
router.post("/:id/artifacts", requireAgentAuth, async (req, res) => {
  try {
    const jobId = paramId(req);
    const agentSession = (req as any).agentSession;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.machineId !== agentSession.machineId) {
      return res.status(403).json({ error: "Job not assigned to this machine" });
    }

    const { filename, storagePath, mimeType, sizeBytes } = req.body as {
      filename?: string;
      storagePath?: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    if (!filename || typeof filename !== "string" || !storagePath || typeof storagePath !== "string") {
      return res.status(400).json({ error: "filename and storagePath are required" });
    }

    const artifact = await prisma.artifact.create({
      data: {
        jobId,
        filename,
        storagePath,
        mimeType: mimeType ?? null,
        sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
      },
    });

    await appendJobEvent(
      jobId,
      "artifact_registered",
      { artifactId: artifact.id, filename } as Prisma.InputJsonValue
    );
    emitJobUpdate(jobId, { type: "artifact", jobId, artifact });
    res.status(201).json(artifact);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register artifact" });
  }
});

// POST /api/jobs/:id/stop
router.post("/:id/stop", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = paramId(req);
    const role = await getUserRole(user.id);

    const job = await prisma.job.findUnique({
      where: { id },
      include: { machine: true },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canStopJob(user.id, role, job))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!canStop(job.status)) {
      return res.status(400).json({ error: "Job is already terminal" });
    }

    const nextStatus = resolveStopTargetStatus(job, user.id);

    const updated = await prisma.$transaction(async (tx) => {
      const j = await tx.job.update({
        where: { id },
        data: { status: nextStatus },
      });
      const eventData: Prisma.JobEventUncheckedCreateInput = {
        jobId: id,
        type: "stop_requested",
        payload: { nextStatus } as Prisma.InputJsonValue,
        actorId: user.id,
      };
      await tx.jobEvent.create({ data: eventData });
      return j;
    });

    emitJobUpdate(id, { status: updated.status, jobId: id });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to stop job" });
  }
});

// GET /api/jobs/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = paramId(req);
    const role = await getUserRole(user.id);

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        approval: true,
        machine: { select: { id: true, ownerId: true, status: true, lastHeartbeatAt: true } },
        events: { orderBy: { createdAt: "desc" }, take: 50 },
        _count: { select: { logs: true, artifacts: true } },
      },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(user.id, role, job))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

export default router;

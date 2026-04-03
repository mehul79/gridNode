import { Router } from "express";
import { GpuVendor, Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { hashToken } from "../lib/token";
import { requireAgentAuth } from "../middleware/requireAgentAuth";

const router = Router();

// Helper: parse GPU vendor from nvidia-smi output
function parseGpuVendor(name: string): GpuVendor | null {
  const lower = name.toLowerCase();
  if (lower.includes("nvidia")) return "nvidia";
  if (lower.includes("amd") || lower.includes("radeon")) return "amd";
  if (lower.includes("intel")) return "intel";
  return null
}

// POST /api/agent/machines/register — agent initial registration with userKey
router.post("/machines/register", async (req, res) => {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : null;
    if (!token) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }

    // Find machine by userKey
    const machine = await prisma.machine.findFirst({
      where: { userKey: token },
    });
    if (!machine) {
      return res.status(404).json({ error: "Invalid machine key. Register machine from dashboard first." });
    }

    const { cpu_cores, ram_gb, gpu, disk_free_gb } = req.body as {
      cpu_cores?: number;
      ram_gb?: number;
      gpu?: { name: string; vram_total_mb: number } | null;
      disk_free_gb?: number;
    };

    // Update machine with actual specs from agent
    const updateData: Prisma.MachineUpdateInput = {};
    if (typeof cpu_cores === "number") {
      updateData.cpuTotal = cpu_cores;
    }
    if (typeof ram_gb === "number") {
      updateData.memoryTotal = Math.round(ram_gb * 1024); // convert GB to MB
    }
    if (gpu) {
      updateData.gpuTotal = 1; // agent currently sends single GPU
      updateData.gpuVendor = parseGpuVendor(gpu.name);
      updateData.gpuMemoryTotal = gpu.vram_total_mb;
    } else {
      updateData.gpuTotal = 0;
      updateData.gpuVendor = null;
      updateData.gpuMemoryTotal = null;
    }

    const updatedMachine = await prisma.machine.update({
      where: { id: machine.id },
      data: updateData,
    });

    // Create AgentSession for this machine so agent can use the same token for future calls
    // We'll create a session with a separate session token? But the agent uses the same token (userKey).
    // So we need to store a hash of the token and mark it active.
    const tokenHash = hashToken(token);
    // Revoke any existing sessions for this machine
    await prisma.agentSession.updateMany({
      where: { machineId: machine.id },
      data: { status: "revoked" as const },
    });
    // Create new active session
    await prisma.agentSession.create({
      data: {
        machineId: machine.id,
        tokenHash,
        status: "active" as const,
      },
    });

    res.json({ machine_id: updatedMachine.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Agent registration failed" });
  }
});

// POST /api/agent/machines/:id/heartbeat — agent uses Bearer token (userKey)
router.post("/machines/:id/heartbeat", requireAgentAuth, async (req, res) => {
  try {
    const machineId = String(req.params.id);
    const agentSession = (req as any).agentSession;

    if (machineId !== agentSession.machineId) {
      return res.status(403).json({ error: "Machine id does not match session" });
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.agentSession.update({
        where: { id: agentSession.id },
        data: { lastHeartbeatAt: now },
      }),
      prisma.machine.update({
        where: { id: agentSession.machineId },
        data: { lastHeartbeatAt: now },
      }),
    ]);

    res.json({ ok: true, lastHeartbeatAt: now.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Heartbeat failed" });
  }
});

// TODO: Add other agent endpoints:
// GET /api/agent/jobs/next
// PATCH /api/agent/jobs/:id/status
// POST /api/agent/jobs/:id/logs
// POST /api/agent/jobs/:id/artifacts

export default router;

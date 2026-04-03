import { Router } from "express";
import authRoutes from "../routes/auth.routes";
import jobRoutes from "../routes/jobs.routes";
import machineRoutes from "../routes/machines.routes";
import approvalRoutes from "../routes/approvals.routes";
import agentRoutes from "../routes/agent.routes";

const router = Router();

router.use("/check", authRoutes);
router.use("/jobs", jobRoutes);
router.use("/machines", machineRoutes);
router.use("/approvals", approvalRoutes);
router.use("/agent", agentRoutes);

export default router;
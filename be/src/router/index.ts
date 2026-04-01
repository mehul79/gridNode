import { Router } from "express";
import authRoutes from "../routes/auth.routes";
import jobRoutes from "../routes/jobs.routes";
import machineRoutes from "../routes/machines.routes";

const router = Router();

router.use("/check", authRoutes);
router.use("/jobs", jobRoutes);
router.use("/machines", machineRoutes);

export default router;
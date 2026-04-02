import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { prisma } from "../lib/db";

const router = Router();

// GET /api/check/me - returns user info with machine count
router.get("/me", requireAuth, async (req, res) => {
  const sessionUser = (req as any).user;
  const userWithCount = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { machines: true } },
    },
  });
  if (!userWithCount) return res.status(404).json({ error: "User not found" });
  res.json({
    id: userWithCount.id,
    name: userWithCount.name,
    email: userWithCount.email,
    image: userWithCount.image,
    createdAt: userWithCount.createdAt,
    updatedAt: userWithCount.updatedAt,
    machineCount: userWithCount._count.machines,
  });
});

export default router;

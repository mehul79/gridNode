import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { prisma } from "../lib/db";
import { generateSessionToken } from "../lib/token";

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
      userKey: true,
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
    userKey: userWithCount.userKey,
    createdAt: userWithCount.createdAt,
    updatedAt: userWithCount.updatedAt,
    machineCount: userWithCount._count.machines,
  });
});

// POST /api/check/user-key - generate or regenerate userKey
router.post("/user-key", requireAuth, async (req, res) => {
  try {
    const sessionUser = (req as any).user;
    const newKey = "cs_" + generateSessionToken();

    const updatedUser = await prisma.user.update({
      where: { id: sessionUser.id },
      data: { userKey: newKey },
    });

    res.json({ userKey: updatedUser.userKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate user key" });
  }
});

export default router;

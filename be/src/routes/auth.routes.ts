import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

const router = Router();

// GET /api/check/me - returns full user with role
router.get("/me", requireAuth, async (req, res) => {
  const sessionUser = (req as any).user;
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, name: true, email: true, image: true, role: true, createdAt: true, updatedAt: true },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });
  res.json(dbUser);
});

// Dev-only: set user role (for testing)
if (process.env.NODE_ENV === "development") {
  router.post("/dev/set-role", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const role = String(req.query.role);
    if (!role || !["owner", "requester", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Use: owner, requester, admin" });
    }
    try {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { role } as Prisma.UserUpdateInput,
      });
      // Return minimal user info
      res.json({ success: true, user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update role" });
    }
  });
}

export default router;
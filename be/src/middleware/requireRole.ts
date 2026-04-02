import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/db";

const OWNER_ROLES = new Set(["owner", "admin"]);

export async function requireOwnerOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const sessionUser = (req as any).user;
  if (!sessionUser?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { role: true, id: true },
    });
    if (!user || !OWNER_ROLES.has(user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    (req as any).dbUser = user;
    next();
  } catch {
    return res.status(500).json({ message: "Failed to verify role" });
  }
}

export function isOwnerOrAdminRole(role: string): boolean {
  return OWNER_ROLES.has(role);
}

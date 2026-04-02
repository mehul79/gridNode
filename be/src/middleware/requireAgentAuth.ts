import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/db";
import { hashToken } from "../lib/token";

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const body = req.body as { sessionToken?: string } | undefined;
  if (body?.sessionToken && typeof body.sessionToken === "string") {
    return body.sessionToken.trim();
  }
  return undefined;
}

/**
 * Validates Bearer token or body.sessionToken against an active AgentSession.
 * Attaches agentSession (with machine) to req.
 */
export async function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: "Missing agent token" });
  }

  try {
    const tokenHash = hashToken(token);
    const agentSession = await prisma.agentSession.findFirst({
      where: { tokenHash, status: "active" },
      include: { machine: true },
    });
    if (!agentSession) {
      return res.status(401).json({ message: "Invalid agent session" });
    }
    (req as any).agentSession = agentSession;
    (req as any).machine = agentSession.machine;
    next();
  } catch {
    return res.status(500).json({ message: "Agent auth failed" });
  }
}

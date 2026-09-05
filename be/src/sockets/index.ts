import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../lib/auth";
import { prisma } from "../lib/db";
import { canViewJob } from "../lib/jobAccess";
import { allowedOrigins } from "../lib/config";

let io: JobServer | undefined;

/** Set by the handshake middleware; every connected socket has an authenticated user. */
interface SocketData {
  userId: string;
}

interface ServerToClientEvents {
  log: (line: string) => void;
  "job-update": (data: unknown) => void;
  "email-sent": (data: unknown) => void;
  "join-error": (data: { jobId: string; message: string }) => void;
}

interface ClientToServerEvents {
  "join-job": (jobId: string, ack?: (result: { ok: boolean; error?: string }) => void) => void;
  "leave-job": (jobId: string) => void;
}

type JobServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type JobSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const initSocket = (server: HttpServer) => {
  io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(server, {
    cors: {
      origin: allowedOrigins(),
      credentials: true,
    },
  });

  // Authenticate the handshake. Sockets carry the same Better Auth session
  // cookie as the REST API, so an unauthenticated client never connects.
  io.use(async (socket, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(socket.request.headers),
      });
      if (!session?.user) {
        return next(new Error("Unauthorized"));
      }
      socket.data.userId = session.user.id;
      next();
    } catch (err) {
      console.error("[socket] Handshake auth failed:", err);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: JobSocket) => {
    console.log(`[socket] Connected: ${socket.id} (user ${socket.data.userId})`);

    // Joining a job room streams that job's logs, status and artifacts, so it
    // requires the same read authorization as GET /api/jobs/:id.
    socket.on("join-job", async (rawJobId, ack) => {
      const jobId = typeof rawJobId === "string" ? rawJobId : "";
      if (!jobId) {
        socket.emit("join-error", { jobId, message: "jobId is required" });
        ack?.({ ok: false, error: "jobId is required" });
        return;
      }

      try {
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          include: { machine: { select: { ownerId: true } } },
        });

        if (!job || !(await canViewJob(socket.data.userId, job))) {
          // Same response for missing and forbidden, so room membership can't
          // be used to probe for job ids.
          socket.emit("join-error", { jobId, message: "Forbidden" });
          ack?.({ ok: false, error: "Forbidden" });
          return;
        }

        socket.join(`job-${jobId}`);
        ack?.({ ok: true });
      } catch (err) {
        console.error(`[socket] join-job failed for ${jobId}:`, err);
        socket.emit("join-error", { jobId, message: "Failed to join job" });
        ack?.({ ok: false, error: "Failed to join job" });
      }
    });

    socket.on("leave-job", (rawJobId) => {
      if (typeof rawJobId === "string" && rawJobId) {
        socket.leave(`job-${rawJobId}`);
      }
    });
  });
};

export const emitLog = (jobId: string, log: string) => {
  io?.to(`job-${jobId}`).emit("log", log);
};

export const emitJobUpdate = (jobId: string, data: unknown) => {
  io?.to(`job-${jobId}`).emit("job-update", data);
};

export const emitMailUpdate = (jobId: string, data: unknown) => {
  io?.to(`job-${jobId}`).emit("email-sent", data);
};

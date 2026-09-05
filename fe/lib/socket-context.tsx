"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3005";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinJob: (jobId: string) => void;
  leaveJob: (jobId: string) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  // Held in state, not a ref: consumers must re-render once the socket exists,
  // otherwise `socket` stays null for them and joinJob silently does nothing.
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const s = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      // The server authenticates the handshake with the Better Auth session
      // cookie, so the cookie has to travel with the upgrade/polling requests.
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    s.on("connect", () => {
      console.log("Socket connected:", s.id);
      setIsConnected(true);
    });

    s.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
    });

    s.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
    });

    // The server refuses rooms for jobs this user is not allowed to read.
    s.on("join-error", ({ jobId, message }: { jobId: string; message: string }) => {
      console.error(`Cannot subscribe to job ${jobId}: ${message}`);
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, []);

  const joinJob = useCallback(
    (jobId: string) => {
      if (!socket) return;
      socket.emit("join-job", jobId);
    },
    [socket]
  );

  const leaveJob = useCallback(
    (jobId: string) => {
      if (!socket) return;
      socket.emit("leave-job", jobId);
    },
    [socket]
  );

  const value = useMemo(
    () => ({ socket, isConnected, joinJob, leaveJob }),
    [socket, isConnected, joinJob, leaveJob]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
}

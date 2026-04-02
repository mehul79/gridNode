"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
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
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinJob = (jobId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("join-job", jobId);
      console.log(`Joined job room: job-${jobId}`);
    }
  };

  const leaveJob = (jobId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("leave-job", jobId); // if server supports it
      console.log(`Left job room: job-${jobId}`);
    }
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected, joinJob, leaveJob }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
}

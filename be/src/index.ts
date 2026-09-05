import express from "express";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import http from "http";

import { auth } from "./lib/auth";
import router from "./router";
import { initSocket } from "./sockets";
import { startSweeper, stopSweeper } from "./lib/sweeper";
import { emailWorker } from "./queues/email.worker";
import { connection as redisConnection } from "./queues/connection";
import { allowedOrigins } from "./lib/config";
import promClient from "prom-client";

let sweeperInterval: NodeJS.Timeout | null = null;

// Prevent unhandled exceptions from Redis crashes/connection drops
redisConnection.on("error", (err) => {
  console.error("[Redis Client Error] Connection error in index.ts:", err);
});

// Setup Prometheus Metrics
promClient.collectDefaultMetrics();

const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5]
});

const app = express();
const server = http.createServer(app);

// Metrics middleware
app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    if (req.path !== '/metrics') {
      end({ method: req.method, route: req.route?.path || req.path, code: res.statusCode });
    }
  });
  next();
});

// Expose /metrics
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// CORS
app.use(
  cors({
    origin: allowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  })
);

// Better Auth FIRST
app.all("/api/auth/*splat", toNodeHandler(auth));

// JSON middleware AFTER auth
app.use(express.json());

// Routes
app.use("/api", router);

// Health
app.get("/health", (_, res) => {
  res.send("API running 🚀");
});

app.get("/", (_, res) => {
  res.send("API running 🚀");
});

// Socket
initSocket(server);

// Start
server.listen(3005, () => {
  console.log("Server running on 3005");
  sweeperInterval = startSweeper();
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down");
  if (sweeperInterval) {
    clearInterval(sweeperInterval);
    sweeperInterval = null;
  }
  stopSweeper();
  await emailWorker.close();
  redisConnection.quit();
  server.close(() => process.exit(0));
})

process.on("SIGINT", async () => {
  if (sweeperInterval) {
    clearInterval(sweeperInterval);
    sweeperInterval = null;
  }
  stopSweeper();
  await emailWorker.close();
  redisConnection.quit();
  server.close(() => process.exit(0));
})
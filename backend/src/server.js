import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import cors from "cors";
import mongoose from "mongoose";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { connectDB } from "./lib/db.js";
import { ENV } from "./lib/env.js";
import { app, server } from "./lib/socket.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error.middleware.js";

const __dirname = path.resolve();
const PORT = ENV.PORT || 3000;

app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));

const clientUrls = (ENV.CLIENT_URL || "")
  .split(",")
  .map((url) => url.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedOrigins = [
  ...clientUrls,
  "https://samvad-live.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(cookieParser());

// Root endpoint for status / health info
app.get("/", (_, res) => {
  const frontendDistPath = path.join(__dirname, "../frontend/dist/index.html");
  if (ENV.NODE_ENV === "production" && fs.existsSync(frontendDistPath)) {
    return res.sendFile(frontendDistPath);
  }
  res.status(200).json({
    name: "Samvad API Server",
    status: "running",
    version: "1.0.0",
    client: "https://samvad-live.vercel.app",
    health: "/healthz",
  });
});

// Healthcheck endpoint for orchestrators, uptime checks, and load balancers
app.get("/healthz", (_, res) => {
  const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbStates[mongoose.connection.readyState] || "unknown",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// Production frontend serving (if bundled with client build)
if (ENV.NODE_ENV === "production") {
  const frontendDistPath = path.join(__dirname, "../frontend/dist");
  if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));

    app.get("*", (_, res) => {
      res.sendFile(path.join(frontendDistPath, "index.html"));
    });
  } else {
    app.use("/api/*", notFoundHandler);
    app.get("*", (_, res) => {
      res.status(404).json({
        message:
          "This is the Samvad backend API server. For the web application, visit https://samvad-live.vercel.app",
        health: "/healthz",
      });
    });
  }
} else {
  // In development, handle unknown API routes gracefully
  app.use("/api/*", notFoundHandler);
}

// Global Centralized Error Handling Middleware
app.use(errorHandler);

const httpServer = server.listen(PORT, () => {
  console.log("Server running on port: " + PORT);
  connectDB();
});

// Graceful Shutdown Handling
const handleShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  httpServer.close(async () => {
    console.log("HTTP server closed.");
    try {
      await mongoose.disconnect();
      console.log("MongoDB connection closed.");
      process.exit(0);
    } catch (err) {
      console.error("Error disconnecting MongoDB:", err);
      process.exit(1);
    }
  });

  // Force close if graceful shutdown hangs
  setTimeout(() => {
    console.error("Forceful shutdown after timeout.");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

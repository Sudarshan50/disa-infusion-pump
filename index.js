import express from "express";
import { createServer } from "http";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
import {
  globalErrorHandler,
  notFoundHandler,
} from "./src/middleware/errorHandler.js";
import { successResponse } from "./src/lib/responseUtils.js";
import db from "./src/lib/db.js";
import { connectToRedis } from "./src/lib/redis.js";
import router from "./src/routes/index.js";
import mqttService from "./src/lib/mqtt.js";
import socketService from "./src/lib/socket.js";

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  successResponse(res, null, "The service is healthy and running!");
});

app.use("/api", router);

app.use(notFoundHandler);
app.use(globalErrorHandler);

db()
  .then(() => {
    connectToRedis().catch((err) => {
      console.error("Failed to connect to Redis", err);
      process.exit(1);
    });

    mqttService.connect().catch((err) => {
      console.error("Failed to connect to MQTT broker", err);
    });

    socketService.init(server);
    mqttService.setSocketService(socketService);

    server.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔌 Socket.IO server ready for connections`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database", err);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  console.log("🛑 Shutting down gracefully...");
  await mqttService.disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down gracefully...");
  await mqttService.disconnect();
  process.exit(0);
});

import { Server } from "socket.io";
import { redisClient } from "./redis.js";
import Device from "../models/Device.js";

class SocketService {
  constructor() {
    this.io = null;
    this.activeSubscriptions = new Map(); // Track active device subscriptions
  }

  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*", // Configure this for production
        methods: ["GET", "POST"],
      },
    });

    this.io.on("connection", (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Handle device status subscription
      socket.on("subscribe:device:status", async (deviceId) => {
        try {
          await this.subscribeToDeviceStatus(socket, deviceId);
        } catch (error) {
          socket.emit("error", {
            message: "Failed to subscribe to device status",
            error: error.message,
          });
        }
      });

      // Handle device progress subscription
      socket.on("subscribe:device:progress", async (deviceId) => {
        try {
          await this.subscribeToDeviceProgress(socket, deviceId);
        } catch (error) {
          socket.emit("error", {
            message: "Failed to subscribe to device progress",
            error: error.message,
          });
        }
      });

      // Handle device error/notification subscription
      socket.on("subscribe:device:errors", async (deviceId) => {
        try {
          await this.subscribeToDeviceErrors(socket, deviceId);
        } catch (error) {
          socket.emit("error", {
            message: "Failed to subscribe to device errors",
            error: error.message,
          });
        }
      });

      // Handle unsubscribe from device status
      socket.on("unsubscribe:device:status", (deviceId) => {
        this.unsubscribeFromDevice(socket, deviceId, "status");
      });

      // Handle unsubscribe from device progress
      socket.on("unsubscribe:device:progress", (deviceId) => {
        this.unsubscribeFromDevice(socket, deviceId, "progress");
      });

      // Handle unsubscribe from device errors
      socket.on("unsubscribe:device:errors", (deviceId) => {
        this.unsubscribeFromDevice(socket, deviceId, "errors");
      });

      // Handle client disconnect
      socket.on("disconnect", () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        this.cleanupSocketSubscriptions(socket);
      });
    });

    console.log("✅ Socket.IO server initialized");
  }

  async subscribeToDeviceStatus(socket, deviceId) {
    // Verify device exists
    const deviceCheck = await Device.findOne({ deviceId });
    if (!deviceCheck) {
      socket.emit("error", { message: "Invalid Device ID" });
      return;
    }

    // Join device-specific room
    const room = `device:${deviceId}:status`;
    socket.join(room);

    // Track subscription
    if (!this.activeSubscriptions.has(socket.id)) {
      this.activeSubscriptions.set(socket.id, new Set());
    }
    this.activeSubscriptions.get(socket.id).add(room);

    console.log(`📡 Client ${socket.id} subscribed to ${room}`);

    // Send initial status
    await this.sendCurrentStatus(socket, deviceId);

    // Start periodic status updates
    this.startStatusUpdates(deviceId);
  }

  async subscribeToDeviceProgress(socket, deviceId) {
    // Verify device exists
    const deviceCheck = await Device.findOne({ deviceId });
    if (!deviceCheck) {
      socket.emit("error", { message: "Invalid Device ID" });
      return;
    }

    // Join device-specific room
    const room = `device:${deviceId}:progress`;
    socket.join(room);

    // Track subscription
    if (!this.activeSubscriptions.has(socket.id)) {
      this.activeSubscriptions.set(socket.id, new Set());
    }
    this.activeSubscriptions.get(socket.id).add(room);

    console.log(`📡 Client ${socket.id} subscribed to ${room}`);

    // Send initial progress
    await this.sendCurrentProgress(socket, deviceId);

    // Start periodic progress updates
    this.startProgressUpdates(deviceId);
  }

  async subscribeToDeviceErrors(socket, deviceId) {
    // Verify device exists
    const deviceCheck = await Device.findOne({ deviceId });
    if (!deviceCheck) {
      socket.emit("error", { message: "Invalid Device ID" });
      return;
    }

    // Join device-specific room for errors/notifications
    const room = `device:${deviceId}:errors`;
    socket.join(room);

    // Track subscription
    if (!this.activeSubscriptions.has(socket.id)) {
      this.activeSubscriptions.set(socket.id, new Set());
    }
    this.activeSubscriptions.get(socket.id).add(room);

    console.log(
      `🚨 Client ${socket.id} subscribed to error notifications for ${room}`
    );

    // Send recent errors if any
    await this.sendRecentErrors(socket, deviceId);
  }

  async sendCurrentStatus(socket, deviceId) {
    try {
      const statusData = await redisClient.get(`device:${deviceId}:status`);
      let status = { status: "unknown", lastPing: null };

      if (statusData) {
        status = JSON.parse(statusData);
      } else {
        status.status = "degraded";
        //TODO: May be remove this block later (further optimization)
        const getDeviceDbStatus = await Device.findOne({ deviceId });
        if (getDeviceDbStatus) {
          if (getDeviceDbStatus.status !== "degraded") {
            await Device.updateOne({ deviceId }, { status: "degraded" });
          }

          // Update Redis with the degraded status
          const indiaTime = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
          });
          await redisClient.set(
            `device:${deviceId}:status`,
            JSON.stringify({
              status: "degraded",
              lastPing: indiaTime,
              timestamp: new Date().toISOString(),
            }),
            { EX: 30 }
          );

          status = {
            status: "degraded",
            lastPing: indiaTime,
            timestamp: new Date().toISOString(),
          };
        }
      }

      socket.emit("device:status:update", {
        deviceId,
        ...status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error sending status for ${deviceId}:`, error);
    }
  }

  async sendCurrentProgress(socket, deviceId) {
    try {
      const progressData = await redisClient.get(`device:${deviceId}:progress`);
      let progress = null;

      if (progressData) {
        const parsedProgress = JSON.parse(progressData);
        progress = {
          timeRemainingMin: parsedProgress.timeRemainingMin || 0,
          volumeRemainingMl: parsedProgress.volumeRemainingMl || 0,
          lastUpdated: parsedProgress.timestamp || null,
        };
      }

      socket.emit("device:progress:update", {
        deviceId,
        progress,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error sending progress for ${deviceId}:`, error);
    }
  }

  async sendRecentErrors(socket, deviceId) {
    try {
      // Get recent errors from Redis
      const cacheKey = `device:${deviceId}:errors`;
      const cachedErrors = await redisClient.get(cacheKey);

      if (cachedErrors) {
        const errorData = JSON.parse(cachedErrors);
        console.log(`📤 Sending cached errors for device ${deviceId}`);
        socket.emit("device:error", { deviceId, error: errorData });
      } else {
        console.log(`📭 No cached errors found for device ${deviceId}`);
        socket.emit("device:error", { deviceId, error: null });
      }
    } catch (error) {
      console.error(
        `❌ Error sending recent errors for device ${deviceId}:`,
        error
      );
      socket.emit("error", { message: "Failed to retrieve error data" });
    }
  }

  startStatusUpdates(deviceId) {
    const room = `device:${deviceId}:status`;

    // Check if we already have an interval for this device
    if (this.statusIntervals && this.statusIntervals.has(deviceId)) {
      return;
    }

    if (!this.statusIntervals) {
      this.statusIntervals = new Map();
    }

    // Start interval to send status updates every 5 seconds
    const interval = setInterval(async () => {
      const roomSockets = await this.io.in(room).fetchSockets();
      if (roomSockets.length === 0) {
        // No clients subscribed, clear interval
        clearInterval(interval);
        this.statusIntervals.delete(deviceId);
        return;
      }

      // Send status to all clients in the room
      await this.broadcastStatusToRoom(deviceId);
    }, 5000);

    this.statusIntervals.set(deviceId, interval);
  }

  startProgressUpdates(deviceId) {
    const room = `device:${deviceId}:progress`;

    // Check if we already have an interval for this device
    if (this.progressIntervals && this.progressIntervals.has(deviceId)) {
      return;
    }

    if (!this.progressIntervals) {
      this.progressIntervals = new Map();
    }

    // Start interval to send progress updates every 2 seconds
    const interval = setInterval(async () => {
      const roomSockets = await this.io.in(room).fetchSockets();
      if (roomSockets.length === 0) {
        // No clients subscribed, clear interval
        clearInterval(interval);
        this.progressIntervals.delete(deviceId);
        return;
      }

      // Send progress to all clients in the room
      await this.broadcastProgressToRoom(deviceId);
    }, 2000);

    this.progressIntervals.set(deviceId, interval);
  }

  async broadcastStatusToRoom(deviceId) {
    try {
      const statusData = await redisClient.get(`device:${deviceId}:status`);
      let status = { status: "unknown", lastPing: null };

      if (statusData) {
        status = JSON.parse(statusData);
      } else {
        status.status = "degraded";
        //TODO: May be remove this block later (further optimization)
        const getDeviceDbStatus = await Device.findOne({ deviceId });
        if (getDeviceDbStatus) {
          if (getDeviceDbStatus.status !== "degraded") {
            await Device.updateOne({ deviceId }, { status: "degraded" });
          }

          // Update Redis with the degraded status
          const indiaTime = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
          });
          await redisClient.set(
            `device:${deviceId}:status`,
            JSON.stringify({
              status: "degraded",
              lastPing: indiaTime,
              timestamp: new Date().toISOString(),
            }),
            { EX: 30 }
          );

          status = {
            status: "degraded",
            lastPing: indiaTime,
            timestamp: new Date().toISOString(),
          };
        }
      }

      this.io.to(`device:${deviceId}:status`).emit("device:status:update", {
        deviceId,
        ...status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error broadcasting status for ${deviceId}:`, error);
    }
  }

  async broadcastProgressToRoom(deviceId) {
    try {
      const progressData = await redisClient.get(`device:${deviceId}:progress`);
      let progress = null;

      if (progressData) {
        const parsedProgress = JSON.parse(progressData);
        progress = {
          timeRemainingMin: parsedProgress.timeRemainingMin || 0,
          volumeRemainingMl: parsedProgress.volumeRemainingMl || 0,
          lastUpdated: parsedProgress.timestamp || null,
        };
      }

      this.io.to(`device:${deviceId}:progress`).emit("device:progress:update", {
        deviceId,
        progress,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error broadcasting progress for ${deviceId}:`, error);
    }
  }

  unsubscribeFromDevice(socket, deviceId, type) {
    const room = `device:${deviceId}:${type}`;
    socket.leave(room);

    if (this.activeSubscriptions.has(socket.id)) {
      this.activeSubscriptions.get(socket.id).delete(room);
    }

    console.log(`📡 Client ${socket.id} unsubscribed from ${room}`);
  }

  cleanupSocketSubscriptions(socket) {
    if (this.activeSubscriptions.has(socket.id)) {
      const rooms = this.activeSubscriptions.get(socket.id);
      rooms.forEach((room) => {
        socket.leave(room);
      });
      this.activeSubscriptions.delete(socket.id);
    }
  }

  // Method to trigger immediate updates when MQTT data is received
  async notifyStatusUpdate(deviceId) {
    await this.broadcastStatusToRoom(deviceId);
  }

  async notifyProgressUpdate(deviceId) {
    await this.broadcastProgressToRoom(deviceId);
  }

  async notifyDeviceError(deviceId, errorData) {
    try {
      console.log(`🚨 Broadcasting error notification for device ${deviceId}`);

      // Broadcast error to all clients subscribed to this device's errors
      this.io.to(`device:${deviceId}:errors`).emit("device:error", {
        deviceId,
        error: errorData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `❌ Error broadcasting device error for ${deviceId}:`,
        error
      );
    }
  }
}

// Export singleton instance
const socketService = new SocketService();
export default socketService;

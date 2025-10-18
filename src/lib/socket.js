import { Server } from "socket.io";
import Device from "../models/Device.js";
import Infusion from "../models/Infusion.js";

class SocketService {
  constructor() {
    this.io = null;
    this.deviceStreams = new Map(); // Store device stream data in memory
    this.connectedDevices = new Set(); // Track active devices
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

      // Handle device subscription
      socket.on("subscribe:device", ({ deviceId }) => {
        this.subscribeToDevice(socket, deviceId);
      });

      // Handle device unsubscription
      socket.on("unsubscribe:device", ({ deviceId }) => {
        this.unsubscribeFromDevice(socket, deviceId);
      });

      // Handle client disconnect
      socket.on("disconnect", () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        this.connectedDevices.delete(socket.id);
      });
    });

    console.log("✅ Socket.IO server initialized with streaming channels");
  }

  subscribeToDevice(socket, deviceId) {
    // Verify device exists
    Device.findOne({ deviceId })
      .then(deviceCheck => {
        if (!deviceCheck) {
          socket.emit("error", { message: "Invalid Device ID" });
          return;
        }

        // Join device-specific room
        socket.join(`device:${deviceId}`);
        this.connectedDevices.add(socket.id);

        console.log(`📡 Client ${socket.id} subscribed to device: ${deviceId}`);

        // Send subscription confirmation
        socket.emit("stream:subscribed", { deviceId, room: `device:${deviceId}` });

        // Send current device state if available
        const currentData = this.deviceStreams.get(deviceId);
        if (currentData) {
          // Send latest data to the newly connected client
          if (currentData.latestProgress) {
            socket.emit("device:progress", { deviceId, progress: currentData.latestProgress });
          }
          if (currentData.latestStatus) {
            socket.emit("device:status", { deviceId, status: currentData.latestStatus });
          }
          if (currentData.recentErrors && currentData.recentErrors.length > 0) {
            socket.emit("device:error", { deviceId, error: currentData.recentErrors[currentData.recentErrors.length - 1] });
          }
        }
      })
      .catch(error => {
        console.error(`Error checking device ${deviceId}:`, error);
        socket.emit("error", { message: "Database error" });
      });
  }

  unsubscribeFromDevice(socket, deviceId) {
    socket.leave(`device:${deviceId}`);
    console.log(`📡 Client ${socket.id} unsubscribed from device: ${deviceId}`);
  }

  getCurrentDeviceState(deviceId, callback) {
    const deviceData = this.deviceStreams.get(deviceId);
    
    const state = {
      deviceId,
      isConnected: this.connectedDevices.has(deviceId),
      lastUpdate: deviceData?.lastUpdate || null,
      currentInfusion: deviceData?.currentInfusion || null,
      latestProgress: deviceData?.latestProgress || null,
      latestStatus: deviceData?.latestStatus || null,
      recentErrors: deviceData?.recentErrors || [],
    };

    if (callback && typeof callback === 'function') {
      callback(state);
    }

    return state;
  }

  cleanupSocketSubscriptions(socket) {
    // Socket.IO automatically handles room cleanup when socket disconnects
    console.log(`🧹 Cleaned up subscriptions for socket: ${socket.id}`);
  }

  // Direct streaming methods called from MQTT service
  streamProgressData(deviceId, progressData) {
    // Update in-memory device state
    if (!this.deviceStreams.has(deviceId)) {
      this.deviceStreams.set(deviceId, {});
    }
    
    const deviceData = this.deviceStreams.get(deviceId);
    deviceData.latestProgress = progressData;
    deviceData.lastUpdate = progressData.timestamp;
    
    // Mark device as connected
    this.connectedDevices.add(deviceId);

    // Stream to all subscribers using simplified room structure
    this.io.to(`device:${deviceId}`).emit("device:progress", { 
      deviceId, 
      progress: progressData 
    });
    
    console.log(`📈 Streamed progress data for device ${deviceId}`);
  }

  streamErrorData(deviceId, errorData) {
    // Update in-memory device state
    if (!this.deviceStreams.has(deviceId)) {
      this.deviceStreams.set(deviceId, { recentErrors: [] });
    }
    
    const deviceData = this.deviceStreams.get(deviceId);
    if (!deviceData.recentErrors) deviceData.recentErrors = [];
    
    // Keep only last 10 errors
    deviceData.recentErrors.unshift(errorData);
    if (deviceData.recentErrors.length > 10) {
      deviceData.recentErrors = deviceData.recentErrors.slice(0, 10);
    }
    
    deviceData.lastUpdate = errorData.timestamp;

    // Stream to all subscribers
    this.io.to(`device:${deviceId}`).emit("device:error", { 
      deviceId, 
      error: errorData 
    });
    
    console.log(`🚨 Streamed error data for device ${deviceId}`);
  }

  async streamInfusionConfirmation(deviceId, confirmationData) {
    console.log(`📡 Streaming infusion confirmation for device ${deviceId}:`, confirmationData);
    
    try {
      // Update database: Set device status to running and activeInfusion
      const device = await Device.findOneAndUpdate(
        { deviceId },
        { 
          status: 'running',
          activeInfusion: confirmationData.infusionId 
        },
        { new: true }
      );

      if (!device) {
        console.error(`❌ Device ${deviceId} not found in database`);
        return;
      }

      console.log(`✅ Updated device ${deviceId} status to 'running' with activeInfusion: ${confirmationData.infusionId}`);
      
      // Update infusion status to running (device confirmed and is now running)
      const infusion = await Infusion.findByIdAndUpdate(
        confirmationData.infusionId,
        { status: 'running' },
        { new: true }
      );

      if (infusion) {
        console.log(`✅ Updated infusion ${confirmationData.infusionId} status to 'running'`);
      }

    } catch (error) {
      console.error(`❌ Database update error for device ${deviceId}:`, error);
    }
    
    // Update in-memory device state
    if (!this.deviceStreams.has(deviceId)) {
      this.deviceStreams.set(deviceId, {});
    }
    
    const deviceData = this.deviceStreams.get(deviceId);
    deviceData.currentInfusion = {
      infusionId: confirmationData.infusionId,
      status: 'active',
      startedAt: confirmationData.timestamp,
      parameters: confirmationData.parameters || {},
    };
    deviceData.lastUpdate = confirmationData.timestamp;
    
    // Mark device as connected
    this.connectedDevices.add(deviceId);

    // Stream to all subscribers
    const eventData = { 
      deviceId, 
      confirmation: confirmationData 
    };
    
    console.log(`🚀 Emitting device:infusion:confirmed to room device:${deviceId}:`, eventData);
    console.log(`📊 Room device:${deviceId} has ${this.io.sockets.adapter.rooms.get(`device:${deviceId}`)?.size || 0} subscribers`);
    
    this.io.to(`device:${deviceId}`).emit("device:infusion:confirmed", eventData);
    
    console.log(`💉 Streamed infusion confirmation for device ${deviceId}:`, eventData);
    console.log(`📡 Broadcasting to room: device:${deviceId}`);
  }

  streamStatusData(deviceId, statusData) {
    // Update in-memory device state
    if (!this.deviceStreams.has(deviceId)) {
      this.deviceStreams.set(deviceId, {});
    }
    
    const deviceData = this.deviceStreams.get(deviceId);
    deviceData.latestStatus = statusData;
    deviceData.lastUpdate = statusData.timestamp;
    
    // Mark device as connected/disconnected
    if (statusData.status === 'degraded' || statusData.status === 'offline') {
      this.connectedDevices.delete(deviceId);
    } else {
      this.connectedDevices.add(deviceId);
    }

    // Stream to all subscribers
    this.io.to(`device:${deviceId}`).emit("device:status", { 
      deviceId, 
      status: statusData 
    });
    
    console.log(`📊 Streamed status data for device ${deviceId}`);
  }

  // Method to get connected devices (for debugging/monitoring)
  getConnectedDevices() {
    return Array.from(this.connectedDevices);
  }

  // Method to get device stream data (for debugging/monitoring)
  getDeviceStreamData(deviceId) {
    return this.deviceStreams.get(deviceId) || null;
  }
}

// Export singleton instance
const socketService = new SocketService();
export default socketService;

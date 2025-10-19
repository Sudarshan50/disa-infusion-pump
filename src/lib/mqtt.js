import mqtt from "mqtt";
import { redisClient } from "./redis.js";

class MQTTService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.retryAttempts = 0;
    this.maxRetries = 5;
    this.socketService = null;
  }

  setSocketService(socketService) {
    this.socketService = socketService;
  }

  async connect() {
    try {
      const options = {
        host:
          process.env.HIVEMQ_HOST || "your-hivemq-cluster.s1.eu.hivemq.cloud",
        port: process.env.HIVEMQ_PORT || 8883,
        protocol: "mqtts",
        username: process.env.HIVEMQ_USERNAME || "your-username",
        password: process.env.HIVEMQ_PASSWORD || "your-password",
        clean: true,
        connectTimeout: 4000,
        clientId: `backend_${Math.random().toString(16).substr(2, 8)}`,
        reconnectPeriod: 1000,
      };

      this.client = mqtt.connect(options);

      this.client.on("connect", () => {
        console.log("Connected to HiveMQ MQTT Broker");
        this.isConnected = true;
        this.retryAttempts = 0;
        this.subscribeToDeviceTopics();
      });

      this.client.on("error", (error) => {
        console.error("MQTT Connection Error:", error);
        this.isConnected = false;
      });

      this.client.on("offline", () => {
        console.log("MQTT Client offline");
        this.isConnected = false;
      });

      this.client.on("reconnect", () => {
        console.log("MQTT Client reconnecting...");
      });

      this.client.on("message", (topic, message) => {
        this.handleIncomingMessage(topic, message.toString());
      });
    } catch (error) {
      console.error("Failed to connect to MQTT broker:", error);
      this.retryConnection();
    }
  }

  retryConnection() {
    if (this.retryAttempts < this.maxRetries) {
      this.retryAttempts++;
      console.log(
        `Retrying MQTT connection... Attempt ${this.retryAttempts}/${this.maxRetries}`
      );
      setTimeout(() => this.connect(), 5000 * this.retryAttempts);
    } else {
      console.error("Max MQTT connection retries reached");
    }
  }

  subscribeToDeviceTopics() {
    if (!this.isConnected) return;

    const topics = [
      "devices/+/progress", 
      "devices/+/error", 
      "devices/+/status",
      "devices/+/infusion",
      "devices/+/completion"  // Added completion topic
    ];

    topics.forEach((topic) => {
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`Subscribed to ${topic}`);
        }
      });
    });
  }

  async handleIncomingMessage(topic, message) {
    try {
      const data = JSON.parse(message);
      const topicParts = topic.split("/");
      const deviceId = topicParts[1];
      const messageType = topicParts[2];
      
      console.log(`📥 MQTT Message received - Topic: ${topic}, Device: ${deviceId}, Type: ${messageType}`);
      
      switch (messageType) {
        case "progress":
          await this.handleDeviceProgress(deviceId, data);
          break;
        case "error":
          await this.handleDeviceError(deviceId, data);
          break;
        case "infusion":
          await this.handleInfusionConfirmation(deviceId, data);
          break;
        case "completion":
          await this.handleInfusionCompletion(deviceId, data);
          break;
        default:
          console.log(`⚠️ Unhandled message type: ${messageType} for device ${deviceId}`);
      }
    } catch (error) {
      console.error("Error processing MQTT message:", error);
    }
  }

  async handleDeviceProgress(deviceId, data) {
    const progressData = {
      deviceId,
      timeRemainingMin: data.timeRemainingMin || 0,
      volumeRemainingMl: data.volumeRemainingMl || 0,
      timestamp: new Date().toISOString(),
      infusionId: data.infusionId || null,
      progressPercent: data.progressPercent || null,
      ...data,
    };

    console.log(`📈 Progress update from ${deviceId}:`, {
      timeRemainingMin: data.timeRemainingMin,
      volumeRemainingMl: data.volumeRemainingMl,
      infusionId: data.infusionId,
    });

    // Stream directly to Socket.IO clients
    if (this.socketService) {
      this.socketService.streamProgressData(deviceId, progressData);
    }
  }

  async handleDeviceError(deviceId, data) {
    const errorData = {
      deviceId,
      errorId: `error_${deviceId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      severity: data.severity || 'high', // high, medium, low
      type: data.type || 'device_error',
      message: data.message || 'Unknown device error',
      details: data.details || {},
      resolved: false,
      ...data,
    };

    console.error(`🚨 Device ${deviceId} error:`, errorData);

    try {
      // Cache error in Redis for 5 minutes (300 seconds)
      const redisKey = `device_error:${deviceId}:${errorData.errorId}`;
      await redisClient.setEx(redisKey, 300, JSON.stringify(errorData));
      
      // Also add to device error list for notifications
      const deviceErrorsKey = `device_errors:${deviceId}`;
      await redisClient.lPush(deviceErrorsKey, JSON.stringify(errorData));
      await redisClient.expire(deviceErrorsKey, 300); // 5 minutes
      
      console.log(`✅ Error cached in Redis with key: ${redisKey}`);
      
      // Add error to notification stream
      const notificationData = {
        id: errorData.errorId,
        type: 'error',
        priority: errorData.severity === 'high' ? 'critical' : 
                 errorData.severity === 'medium' ? 'warning' : 'info',
        title: `Device Error: ${errorData.type}`,
        message: errorData.message,
        timestamp: errorData.timestamp,
        deviceId: deviceId,
        data: errorData
      };
      
      // Cache notification
      const notificationKey = `notification:${deviceId}:${errorData.errorId}`;
      await redisClient.setEx(notificationKey, 300, JSON.stringify(notificationData));
      
    } catch (redisError) {
      console.error(`❌ Failed to cache error in Redis:`, redisError);
    }

    // Stream directly to Socket.IO clients
    if (this.socketService) {
      this.socketService.streamErrorData(deviceId, errorData);
    }
  }

  async handleInfusionConfirmation(deviceId, data) {
    console.log(`💉 Processing infusion confirmation for device ${deviceId}:`, data);
    
    // Validate the confirmation has required fields
    if (!data.infusionId) {
      console.error('❌ Invalid confirmation - missing infusionId:', data);
      return;
    }

    if (!data.confirmed) {
      console.warn('⚠️ Device did not confirm infusion:', data);
      return;
    }

    console.log(`✅ Valid infusion confirmation - streaming to Socket.IO:`, {
      deviceId,
      infusionId: data.infusionId,
      confirmed: data.confirmed,
      confirmedAt: data.confirmedAt
    });

    // Stream confirmation to Socket.IO clients (now async)
    await this.socketService.streamInfusionConfirmation(deviceId, data);
  }

  async handleInfusionCompletion(deviceId, data) {
    console.log(`🏁 Processing infusion completion for device ${deviceId}:`, data);
    
    // Validate the completion has required fields
    if (!data.completed) {
      console.warn('⚠️ Device completion status is not "completed":', data);
      return;
    }

    console.log(`✅ Valid infusion completion - processing:`, {
      deviceId,
      completed: data.completed,
      completedAt: data.timestamp || data.completedAt,
      summary: data.summary
    });

    // Stream completion to Socket.IO clients
    if (this.socketService) {
      await this.socketService.streamInfusionCompletion(deviceId, data);
    }
  }

  publishCommand(deviceId, command, payload = {}) {
    if (!this.isConnected) {
      throw new Error("MQTT client not connected");
    }

    const topic = `devices/${deviceId}/commands`;
    const message = JSON.stringify({
      command,
      payload,
      timestamp: new Date().toISOString(),
      commandId: Math.random().toString(36).substr(2, 9),
    });

    this.client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        console.error(`Failed to publish command to ${deviceId}:`, err);
      } else {
        console.log(`Published ${command} command to ${deviceId}`);
      }
    });
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      this.client.end();
      this.isConnected = false;
      console.log("MQTT client disconnected");
    }
  }
}

const mqttService = new MQTTService();
export default mqttService;

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

    const topics = ["devices/+/progress", "devices/+/error"];

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

      switch (messageType) {
        case "progress":
          await this.handleDeviceProgress(deviceId, data);
          break;
        case "error":
          await this.handleDeviceError(deviceId, data);
          break;
      }
    } catch (error) {
      console.error("Error processing MQTT message:", error);
    }
  }

  async handleDeviceProgress(deviceId, data) {
    await redisClient.set(
      `device:${deviceId}:progress`,
      JSON.stringify({
        timeRemainingMin: data.timeRemainingMin || 0,
        volumeRemainingMl: data.volumeRemainingMl || 0,
        timestamp: new Date().toISOString(),
        ...data,
      }),
      { EX: 5 }
    );
    console.log(`Progress update from ${deviceId}:`, {
      timeRemainingMin: data.timeRemainingMin,
      volumeRemainingMl: data.volumeRemainingMl,
    });

    // Trigger real-time Socket.IO update
    if (this.socketService) {
      await this.socketService.notifyProgressUpdate(deviceId);
    }
  }

  async handleDeviceError(deviceId, data) {
    console.error(`🚨 Device ${deviceId} error:`, data);
    await redisClient.set(
      `device:${deviceId}:error`,
      JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
      }),
      { EX: 300 }
    );

    if (this.socketService) {
      await this.socketService.notifyDeviceError(deviceId, data);
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

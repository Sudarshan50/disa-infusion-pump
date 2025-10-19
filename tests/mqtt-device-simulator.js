#!/usr/bin/env node

/**
 * MQTT Device Simulator for Infusion Pump
 * This script simulates an infusion device responding to MQTT commands
 */

const mqtt = require("mqtt");
const readline = require("readline");

// Configuration
const config = {
  mqtt: {
    host: process.env.HIVEMQ_HOST || "your-hivemq-cluster.s1.eu.hivemq.cloud",
    port: process.env.HIVEMQ_PORT || 8883,
    protocol: "mqtts",
    username: process.env.HIVEMQ_USERNAME || "your-username",
    password: process.env.HIVEMQ_PASSWORD || "your-password",
  },
  device: {
    id: process.env.DEVICE_ID || "PUMP_0001",
  },
};

// Device state
let deviceState = {
  id: config.device.id,
  status: "healthy",
  infusion: {
    running: false,
    infusionId: null,
    flowRateMlMin: 0,
    plannedTimeMin: 0,
    plannedVolumeMl: 0,
    timeRemainingMin: 0,
    volumeRemainingMl: 0,
    bolusEnabled: false,
    bolusVolumeMl: 0,
    startTime: null,
  },
};

// MQTT topics
const topics = {
  commands: `devices/${config.device.id}/commands`,
  progress: `devices/${config.device.id}/progress`,
  error: `devices/${config.device.id}/error`,
  status: `devices/${config.device.id}/status`,
  infusion: `devices/${config.device.id}/infusion`,
};

// MQTT client
let client = null;
let progressInterval = null;

console.log("🚀 Infusion Device MQTT Simulator");
console.log(`📱 Device ID: ${config.device.id}`);
console.log(`🌐 MQTT Broker: ${config.mqtt.host}:${config.mqtt.port}`);
console.log("");

// Connect to MQTT broker
function connectMQTT() {
  console.log("🔌 Connecting to MQTT broker...");

  const options = {
    host: config.mqtt.host,
    port: config.mqtt.port,
    protocol: config.mqtt.protocol,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clean: true,
    connectTimeout: 4000,
    clientId: `device_simulator_${Math.random().toString(16).substr(2, 8)}`,
    reconnectPeriod: 1000,
  };

  client = mqtt.connect(options);

  client.on("connect", () => {
    console.log("✅ Connected to MQTT broker");

    // Subscribe to command topic
    client.subscribe(topics.commands, (err) => {
      if (err) {
        console.error("❌ Failed to subscribe to commands:", err);
      } else {
        console.log(`📡 Subscribed to: ${topics.commands}`);
      }
    });

    // Send initial status
    publishStatus("healthy");

    console.log("");
    console.log("💡 Device is ready! Waiting for commands...");
    console.log("💡 You can also use the interactive commands below:");
    showHelp();
  });

  client.on("error", (error) => {
    console.error("❌ MQTT Error:", error);
  });

  client.on("offline", () => {
    console.log("🔌 MQTT Client offline");
  });

  client.on("message", (topic, message) => {
    handleMQTTMessage(topic, message.toString());
  });
}

// Handle incoming MQTT messages
function handleMQTTMessage(topic, message) {
  console.log(`📥 Received message on ${topic}`);

  try {
    const data = JSON.parse(message);
    console.log(`📋 Command: ${data.command}`);
    console.log(`📄 Payload:`, JSON.stringify(data.payload, null, 2));

    switch (data.command) {
      case "START_INFUSION":
        handleStartInfusion(data.payload);
        break;
      case "STOP_INFUSION":
        handleStopInfusion(data.payload);
        break;
      case "PAUSE_INFUSION":
        handlePauseInfusion(data.payload);
        break;
      case "RESUME_INFUSION":
        handleResumeInfusion(data.payload);
        break;
      default:
        console.log(`⚠️ Unknown command: ${data.command}`);
    }
  } catch (error) {
    console.error("❌ Failed to parse message:", error);
  }

  console.log("");
}

// Command handlers
function handleStartInfusion(payload) {
  console.log("💉 Starting infusion...");

  // Extract parameters
  deviceState.infusion = {
    running: true,
    infusionId: payload.infusionId,
    flowRateMlMin: payload.flowRateMlMin,
    plannedTimeMin: payload.plannedTimeMin,
    plannedVolumeMl: payload.plannedVolumeMl,
    timeRemainingMin: payload.plannedTimeMin,
    volumeRemainingMl: payload.plannedVolumeMl,
    bolusEnabled: payload.bolus?.enabled || false,
    bolusVolumeMl: payload.bolus?.volumeMl || 0,
    startTime: new Date(),
  };

  deviceState.status = "running";

  console.log(`📊 Infusion Parameters:`);
  console.log(`   - Infusion ID: ${deviceState.infusion.infusionId}`);
  console.log(`   - Flow Rate: ${deviceState.infusion.flowRateMlMin} ml/min`);
  console.log(`   - Planned Time: ${deviceState.infusion.plannedTimeMin} min`);
  console.log(
    `   - Planned Volume: ${deviceState.infusion.plannedVolumeMl} ml`
  );
  console.log(
    `   - Bolus: ${deviceState.infusion.bolusEnabled ? "enabled" : "disabled"} (${deviceState.infusion.bolusVolumeMl} ml)`
  );

  // Handle bolus if enabled
  if (
    deviceState.infusion.bolusEnabled &&
    deviceState.infusion.bolusVolumeMl > 0
  ) {
    console.log(
      `💊 Delivering bolus: ${deviceState.infusion.bolusVolumeMl} ml`
    );
    deviceState.infusion.volumeRemainingMl -=
      deviceState.infusion.bolusVolumeMl;
  }

  // Send infusion confirmation
  publishInfusionConfirmation();

  // Update status
  publishStatus("running");

  // Start progress updates
  startProgressUpdates();

  console.log("✅ Infusion started successfully!");
}

function handleStopInfusion(payload) {
  console.log("🛑 Stopping infusion...");

  deviceState.infusion.running = false;
  deviceState.infusion.timeRemainingMin = 0;
  deviceState.infusion.volumeRemainingMl = 0;
  deviceState.status = "stopped";

  // Stop progress updates
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }

  // Send final progress and status
  publishProgress();
  publishStatus("stopped");

  console.log("✅ Infusion stopped successfully!");
}

function handlePauseInfusion(payload) {
  console.log("⏸️ Pausing infusion...");

  deviceState.infusion.running = false;
  deviceState.status = "paused";

  // Stop progress updates but keep state
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }

  publishStatus("paused");

  console.log("✅ Infusion paused successfully!");
}

function handleResumeInfusion(payload) {
  console.log("▶️ Resuming infusion...");

  deviceState.infusion.running = true;
  deviceState.status = "running";

  // Restart progress updates
  startProgressUpdates();
  publishStatus("running");

  console.log("✅ Infusion resumed successfully!");
}

// Publishing functions
function publishInfusionConfirmation() {
  const message = {
    infusionId: deviceState.infusion.infusionId,
    confirmed: true,
    confirmedAt: new Date().toISOString(),
    parameters: {
      flowRateMlMin: deviceState.infusion.flowRateMlMin,
      plannedTimeMin: deviceState.infusion.plannedTimeMin,
      plannedVolumeMl: deviceState.infusion.plannedVolumeMl,
      bolusEnabled: deviceState.infusion.bolusEnabled,
      bolusVolumeMl: deviceState.infusion.bolusVolumeMl,
    },
  };

  client.publish(
    topics.infusion,
    JSON.stringify(message),
    { qos: 1 },
    (err) => {
      if (err) {
        console.error("❌ Failed to publish infusion confirmation:", err);
      } else {
        console.log("✅ Infusion confirmation sent");
        console.log(
          `📋 Confirmation details:`,
          JSON.stringify(message, null, 2)
        );
      }
    }
  );
}

function publishStatus(status) {
  const message = {
    deviceId: deviceState.id,
    status: status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  client.publish(topics.status, JSON.stringify(message), { qos: 0 }, (err) => {
    if (err) {
      console.error(`❌ Failed to publish status (${status}):`, err);
    } else {
      console.log(`📊 Status published: ${status}`);
    }
  });
}

function publishProgress() {
  if (!deviceState.infusion.infusionId) {
    return;
  }

  const timeProgress =
    ((deviceState.infusion.plannedTimeMin -
      deviceState.infusion.timeRemainingMin) /
      deviceState.infusion.plannedTimeMin) *
    100;
  const volumeProgress =
    ((deviceState.infusion.plannedVolumeMl -
      deviceState.infusion.volumeRemainingMl) /
      deviceState.infusion.plannedVolumeMl) *
    100;

  const message = {
    deviceId: deviceState.id,
    infusionId: deviceState.infusion.infusionId,
    timeRemainingMin: Math.max(0, deviceState.infusion.timeRemainingMin),
    volumeRemainingMl: Math.max(0, deviceState.infusion.volumeRemainingMl),
    timestamp: new Date().toISOString(),
    progressPercent: {
      time: Math.min(100, Math.max(0, timeProgress)),
      volume: Math.min(100, Math.max(0, volumeProgress)),
    },
  };

  client.publish(
    topics.progress,
    JSON.stringify(message),
    { qos: 0 },
    (err) => {
      if (err) {
        console.error("❌ Failed to publish progress:", err);
      } else {
        console.log(
          `📈 Progress: ${message.timeRemainingMin.toFixed(1)}min, ${message.volumeRemainingMl.toFixed(1)}ml remaining (${timeProgress.toFixed(1)}% complete)`
        );
      }
    }
  );
}

function publishError(errorCode, errorMessage, severity = "high") {
  const message = {
    deviceId: deviceState.id,
    infusionId: deviceState.infusion.infusionId,
    errorCode: errorCode,
    message: errorMessage,
    severity: severity,
    timestamp: new Date().toISOString(),
  };

  client.publish(topics.error, JSON.stringify(message), { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Failed to publish error:", err);
    } else {
      console.log(`🚨 Error published: ${errorCode} - ${errorMessage}`);
    }
  });
}

// Progress simulation
function startProgressUpdates() {
  if (progressInterval) {
    clearInterval(progressInterval);
  }

  progressInterval = setInterval(() => {
    if (!deviceState.infusion.running) {
      return;
    }

    // Update progress (2 second intervals)
    const deltaTimeMin = 2 / 60; // 2 seconds in minutes
    const deltaVolumeMl = deviceState.infusion.flowRateMlMin * deltaTimeMin;

    deviceState.infusion.timeRemainingMin -= deltaTimeMin;
    deviceState.infusion.volumeRemainingMl -= deltaVolumeMl;

    // Check if infusion is complete
    if (
      deviceState.infusion.timeRemainingMin <= 0 ||
      deviceState.infusion.volumeRemainingMl <= 0
    ) {
      console.log("🎉 Infusion completed!");
      deviceState.infusion.running = false;
      deviceState.infusion.timeRemainingMin = 0;
      deviceState.infusion.volumeRemainingMl = 0;
      deviceState.status = "completed";

      clearInterval(progressInterval);
      progressInterval = null;

      publishStatus("completed");
    }

    publishProgress();
  }, 2000); // Every 2 seconds
}

// Interactive commands
function setupInteractiveCommands() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", (input) => {
    const command = input.trim().toLowerCase();

    switch (command) {
      case "help":
      case "h":
        showHelp();
        break;
      case "status":
      case "s":
        showDeviceStatus();
        break;
      case "error":
      case "e":
        simulateError();
        break;
      case "test":
      case "t":
        runSelfTest();
        break;
      case "flow":
      case "f":
        runFullInfusionFlow();
        break;
      case "quit":
      case "exit":
      case "q":
        cleanup();
        process.exit(0);
        break;
      default:
        console.log(`❓ Unknown command: ${command}`);
        console.log('💡 Type "help" for available commands');
    }
  });
}

function showHelp() {
  console.log("📖 Available Commands:");
  console.log("  help (h)   - Show this help");
  console.log("  status (s) - Show device status");
  console.log("  error (e)  - Simulate device error");
  console.log("  test (t)   - Run self-test");
  console.log("  flow (f)   - Simulate full infusion flow");
  console.log("  quit (q)   - Exit simulator");
  console.log("");
}

function showDeviceStatus() {
  console.log("📊 Device Status:");
  console.log(`  Device ID: ${deviceState.id}`);
  console.log(`  Status: ${deviceState.status}`);
  console.log(`  Infusion Running: ${deviceState.infusion.running}`);
  if (deviceState.infusion.infusionId) {
    console.log(`  Infusion ID: ${deviceState.infusion.infusionId}`);
    console.log(
      `  Time Remaining: ${deviceState.infusion.timeRemainingMin.toFixed(1)} min`
    );
    console.log(
      `  Volume Remaining: ${deviceState.infusion.volumeRemainingMl.toFixed(1)} ml`
    );
  }
  console.log("");
}

function simulateError() {
  const errors = [
    { code: "E001", message: "Low fluid level detected" },
    { code: "E002", message: "Pump mechanism issue" },
    { code: "E003", message: "Temperature sensor malfunction" },
    { code: "E004", message: "Power supply fluctuation" },
  ];

  const error = errors[Math.floor(Math.random() * errors.length)];
  console.log(`🚨 Simulating error: ${error.code} - ${error.message}`);
  publishError(error.code, error.message);
}

function runSelfTest() {
  console.log("🔧 Running device self-test...");

  publishStatus("testing");

  setTimeout(() => {
    console.log("✅ Self-test completed successfully");
    publishStatus(deviceState.infusion.running ? "running" : "healthy");
  }, 3000);
}

function runFullInfusionFlow() {
  console.log("🧪 Running full infusion flow simulation...");
  console.log(
    "This will simulate: start → confirm → progress → pause → resume → complete"
  );

  // Step 1: Simulate infusion start (as if command came from backend)
  setTimeout(() => {
    console.log("\n📍 Step 1: Simulating infusion start...");
    const mockStartPayload = {
      infusionId: "68f36ed1a8f6e4fe2acf5051", // Mock infusion ID
      flowRateMlMin: 15,
      plannedTimeMin: 2, // Short time for demo
      plannedVolumeMl: 30,
      bolus: {
        enabled: true,
        volumeMl: 5,
      },
    };
    handleStartInfusion(mockStartPayload);
  }, 1000);

  // Step 2: Pause after 30 seconds
  setTimeout(() => {
    console.log("\n📍 Step 2: Simulating pause...");
    handlePauseInfusion({});
  }, 30000);

  // Step 3: Resume after 10 seconds
  setTimeout(() => {
    console.log("\n📍 Step 3: Simulating resume...");
    handleResumeInfusion({});
  }, 40000);

  console.log("⏱️ Flow will complete in ~2 minutes total");
  console.log("💡 Watch the frontend dashboard for real-time updates!");
}

function cleanup() {
  console.log("🧹 Cleaning up...");

  if (progressInterval) {
    clearInterval(progressInterval);
  }

  if (client && client.connected) {
    publishStatus("offline");
    client.end();
  }

  console.log("👋 Goodbye!");
}

// Handle process termination
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Start the simulator
connectMQTT();
setupInteractiveCommands();

// Periodic health status
setInterval(() => {
  if (client && client.connected && !deviceState.infusion.running) {
    publishStatus("healthy");
  }
}, 10000); // Every 10 seconds

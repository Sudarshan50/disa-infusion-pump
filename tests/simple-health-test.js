#!/usr/bin/env node

/**
 * Device Health Check Simulator - sends health checks every 10 seconds
 * Simulates a real infusion pump device reporting its status
 */

const DEVICE_ID = "PUMP_0001";
const BASE_URL = "http://localhost:3000";
const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds

// Enum for device statuses
const DeviceStatus = Object.freeze({
  HEALTHY: "healthy",
  ISSUE: "issue",
  RUNNING: "running",
  PAUSED: "paused",
  STOPPED: "stopped",
  DEGRADED: "degraded",
});

// Valid status options as per the controller
const VALID_STATUSES = Object.values(DeviceStatus);

let healthCheckCount = 0;

// Function to get a random status (or cycle through them for demonstration)
function getDeviceStatus() {
  const statusCycle = [
    DeviceStatus.HEALTHY,
    DeviceStatus.RUNNING,
    DeviceStatus.HEALTHY,
    DeviceStatus.RUNNING,
    DeviceStatus.HEALTHY,
    DeviceStatus.PAUSED,
    DeviceStatus.ISSUE,
  ];
  return statusCycle[healthCheckCount % statusCycle.length];
}

async function sendHealthCheck() {
  healthCheckCount++;
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
  });
  // Use enum for status
  const deviceStatus = getDeviceStatus();

  console.log(`\n🏥 Health Check #${healthCheckCount} - ${timestamp}`);
  console.log("─".repeat(50));
  console.log(`Device ID: ${DEVICE_ID}`);
  console.log(`Status: ${deviceStatus} ${getStatusEmoji(deviceStatus)}`);
  console.log(`URL: ${BASE_URL}/api/device/health`);

  const payload = {
    deviceId: DEVICE_ID,
    status: deviceStatus,
  };

  try {
    const response = await fetch(`${BASE_URL}/api/device/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log(`✅ HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`📤 Sent: ${JSON.stringify(payload)}`);

    const responseText = await response.text();

    if (response.ok) {
      try {
        const jsonData = JSON.parse(responseText);
        console.log(`📄 Response: ${jsonData.message}`);
        console.log(
          `🕒 Next health check in ${HEALTH_CHECK_INTERVAL / 1000} seconds...`
        );
      } catch (e) {
        console.log("❌ Response is not valid JSON:", responseText);
      }
    } else {
      console.log("❌ Error Response:", responseText);
    }
  } catch (error) {
    console.error("💥 Health check failed:", error.message);
    console.log("💡 Make sure your server is running with: npm run dev");
  }
}

// Helper function to get emoji for status
function getStatusEmoji(status) {
  const statusEmojis = {
    [DeviceStatus.HEALTHY]: "💚",
    [DeviceStatus.RUNNING]: "🟢",
    [DeviceStatus.PAUSED]: "🟡",
    [DeviceStatus.STOPPED]: "🔴",
    [DeviceStatus.ISSUE]: "⚠️",
    [DeviceStatus.DEGRADED]: "🟠",
  };
  return statusEmojis[status] || "❓";
}

async function startDeviceSimulator() {
  console.log("🚀 Starting Device Health Check Simulator");
  console.log("═".repeat(60));
  console.log(`📱 Device ID: ${DEVICE_ID}`);
  console.log(`🔄 Interval: Every ${HEALTH_CHECK_INTERVAL / 1000} seconds`);
  console.log(`🎯 Target: ${BASE_URL}`);
  console.log(`📊 Status Options: ${VALID_STATUSES.join(", ")}`);
  console.log("═".repeat(60));
  console.log("💡 Press Ctrl+C to stop the simulator");

  // Check if server is running first
  try {
    const pingResponse = await fetch(`${BASE_URL}/`);
    if (pingResponse.ok) {
      console.log("✅ Server is responding");
    }
  } catch (error) {
    console.error("❌ Cannot reach server. Please start it with: npm run dev");
    process.exit(1);
  }

  // Send first health check immediately
  await sendHealthCheck();

  // Set up interval for subsequent health checks
  setInterval(sendHealthCheck, HEALTH_CHECK_INTERVAL);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n🛑 Device simulator stopped");
  console.log(`📊 Total health checks sent: ${healthCheckCount}`);
  process.exit(0);
});

// Start the simulator
startDeviceSimulator().catch(console.error);

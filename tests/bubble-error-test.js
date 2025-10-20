#!/usr/bin/env node

/**
 * Bubble Error Test - Simulates ESP32 Bubble Detection MQTT Messages
 * 
 * This script tests the exact format that ESP32 will send for bubble detection
 * to ensure proper integration with backend error handling system.
 */

import mqtt from "mqtt";

// Configuration - using the same MQTT broker as the main application
const deviceId = "DISA_ESP32_001"; // Match ESP32 device ID
const brokerOptions = {
  host: "4ebd6137905848fc8246b374d7253984.s1.eu.hivemq.cloud",
  port: 8883,
  protocol: "mqtts",
  username: "pump001",
  password: "Disa@123",
  clean: true,
  connectTimeout: 4000,
  clientId: `bubble_test_${Math.random().toString(16).substr(2, 8)}`,
  reconnectPeriod: 1000,
};

console.log("🫧 Bubble Detection Error Test");
console.log(`📡 Connecting to MQTT broker: ${brokerOptions.host}:${brokerOptions.port}`);
console.log(`🔧 Device ID: ${deviceId}`);
console.log("🚨 Testing HIGH severity bubble errors (should trigger modal + error sound)");

// Connect to MQTT broker
const client = mqtt.connect(brokerOptions);

client.on("connect", () => {
  console.log("✅ Connected to MQTT broker");
  console.log("");
  
  // Test bubble detected
  setTimeout(() => {
    sendBubbleDetectedError();
  }, 1000);
  
  // Test bubble cleared
  setTimeout(() => {
    sendBubbleClearedError();
  }, 5000);
  
  // Cleanup
  setTimeout(() => {
    console.log("🏁 Bubble error test completed!");
    client.end();
    process.exit(0);
  }, 8000);
});

client.on("error", (error) => {
  console.error("❌ MQTT Connection Error:", error);
  process.exit(1);
});

function sendBubbleDetectedError() {
  const errorData = {
    type: "bubble_detected",
    severity: "high",  // High severity to trigger modal
    message: "Air bubble detected in IV line - infusion automatically paused for patient safety",
    deviceId: deviceId,
    timestamp: new Date().toISOString(),
    details: {
      sensorPin: 17,
      sensorValue: 1, // HIGH = bubble detected
      autoAction: "PAUSED_INFUSION",
      pumpStatus: "paused",
      infusionId: "test_infusion_123",
      wasRunningBeforeBubble: true
    }
  };

  const topic = `devices/${deviceId}/error`;

  console.log(`🚨 Sending BUBBLE DETECTED error (HIGH severity):`);
  console.log(`   Topic: ${topic}`);
  console.log(`   Type: ${errorData.type}`);
  console.log(`   Severity: ${errorData.severity}`);
  console.log(`   Message: ${errorData.message}`);
  console.log(`   Details:`, errorData.details);
  console.log("");

  client.publish(topic, JSON.stringify(errorData), { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Failed to publish bubble detected error:", err);
    } else {
      console.log("✅ Bubble DETECTED error published successfully!");
      console.log("🔍 Expected: Modal should appear + error sound should play");
      console.log("");
    }
  });
}

function sendBubbleClearedError() {
  const errorData = {
    type: "bubble_cleared",
    severity: "high",  // Still high to ensure visibility
    message: "Bubble cleared - infusion ready to resume",
    deviceId: deviceId,
    timestamp: new Date().toISOString(),
    details: {
      sensorPin: 17,
      sensorValue: 0, // LOW = bubble cleared
      autoAction: "READY_TO_RESUME",
      pumpStatus: "paused",
      infusionId: "test_infusion_123",
      wasRunningBeforeBubble: true
    }
  };

  const topic = `devices/${deviceId}/error`;

  console.log(`✅ Sending BUBBLE CLEARED notification:`);
  console.log(`   Topic: ${topic}`);
  console.log(`   Type: ${errorData.type}`);
  console.log(`   Severity: ${errorData.severity}`);
  console.log(`   Message: ${errorData.message}`);
  console.log(`   Details:`, errorData.details);
  console.log("");

  client.publish(topic, JSON.stringify(errorData), { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Failed to publish bubble cleared error:", err);
    } else {
      console.log("✅ Bubble CLEARED notification published successfully!");
      console.log("🔍 Expected: Notification should appear indicating bubble is cleared");
      console.log("");
    }
  });
}
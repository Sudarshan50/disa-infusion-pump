#!/usr/bin/env node

import mqtt from "mqtt";

/**
 * Test script to verify that infusion confirmation properly updates:
 * 1. Device status to "running"
 * 2. Device activeInfusion to the infusion ID
 * 3. Infusion status to "confirmed" (if status field exists)
 */

const TEST_CONFIG = {
  deviceId: "DEVICE-001",
  infusionId: "673f3f57b2b7c2d74c123456", // Replace with actual infusion ID
  mqttConfig: {
    host: process.env.HIVEMQ_HOST || "your-hivemq-cluster.s1.eu.hivemq.cloud",
    port: process.env.HIVEMQ_PORT || 8883,
    protocol: "mqtts",
    username: process.env.HIVEMQ_USERNAME || "your-username",
    password: process.env.HIVEMQ_PASSWORD || "your-password",
    clientId: `test_confirmation_${Math.random().toString(16).substr(2, 8)}`,
  },
};

function publishInfusionConfirmation() {
  console.log("🧪 Testing Infusion Confirmation Database Updates");
  console.log("=".repeat(50));

  const client = mqtt.connect(TEST_CONFIG.mqttConfig);

  client.on("connect", () => {
    console.log("✅ Connected to MQTT broker");

    const confirmationPayload = {
      infusionId: TEST_CONFIG.infusionId,
      confirmed: true,
      confirmedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      parameters: {
        flowRateMlMin: 5.0,
        plannedTimeMin: 120,
        plannedVolumeMl: 600,
      },
    };

    const topic = `devices/${TEST_CONFIG.deviceId}/infusion`;

    console.log(`📤 Publishing infusion confirmation to topic: ${topic}`);
    console.log(`📋 Payload:`, JSON.stringify(confirmationPayload, null, 2));

    client.publish(
      topic,
      JSON.stringify(confirmationPayload),
      { qos: 1 },
      (err) => {
        if (err) {
          console.error("❌ Failed to publish confirmation:", err);
        } else {
          console.log("✅ Infusion confirmation published successfully");
          console.log("\n🔍 Expected database updates:");
          console.log(`   • Device ${TEST_CONFIG.deviceId} status → "running"`);
          console.log(
            `   • Device ${TEST_CONFIG.deviceId} activeInfusion → "${TEST_CONFIG.infusionId}"`
          );
          console.log(
            `   • Infusion ${TEST_CONFIG.infusionId} status → "confirmed"`
          );
          console.log(
            "\n💡 Check your backend logs and database to verify these updates occurred."
          );
        }

        setTimeout(() => {
          client.end();
          process.exit(0);
        }, 1000);
      }
    );
  });

  client.on("error", (error) => {
    console.error("❌ MQTT connection error:", error);
    process.exit(1);
  });
}

// Add instructions
console.log(`
🧪 Infusion Confirmation Database Update Test
===========================================

This test will:
1. Connect to MQTT broker
2. Publish an infusion confirmation message
3. Trigger database updates in your backend

Prerequisites:
1. Backend server must be running
2. MongoDB must be connected
3. Device "${TEST_CONFIG.deviceId}" must exist in database
4. Infusion "${TEST_CONFIG.infusionId}" must exist in database

Update TEST_CONFIG above with valid deviceId and infusionId before running.

Starting test in 3 seconds...
`);

setTimeout(publishInfusionConfirmation, 3000);

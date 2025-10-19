#!/usr/bin/env node

/**
 * ESP32 Infusion Progress Simulation
 *
 * This script accurately simulates an ESP32 device sending progress data
 * according to the exact infusion parameters, not random data.
 *
 * Progress Calculation:
 * - Time-based: elapsed = (current_time - start_time) in real minutes
 * - Volume-based: delivered = elapsed_time * flow_rate
 * - Remaining: planned - delivered/elapsed
 *
 * MQTT Format matches backend expectations:
 * - Topic: devices/{deviceId}/progress
 * - Payload: { timeRemainingMin, volumeRemainingMl, timestamp, ... }
 *
 * Real-Time Simulation: No acceleration - actual time progression
 */

// const mqtt = require('mqtt');
import mqtt from "mqtt";

// Configuration - using the same MQTT broker as the main application
const deviceId = "PUMP_0001"; // Changed to match the frontend device ID
const brokerOptions = {
  host: "4ebd6137905848fc8246b374d7253984.s1.eu.hivemq.cloud",
  port: 8883,
  protocol: "mqtts",
  username: "pump001",
  password: "Disa@123",
  clean: true,
  connectTimeout: 4000,
  clientId: `test_device_${Math.random().toString(16).substr(2, 8)}`,
  reconnectPeriod: 1000,
};

// Infusion parameters for progress simulation (realistic values)
// NOTE: For full testing, change plannedTimeMin to 60+ minutes for real-world infusions
const infusionParams = {
  flowRateMlMin: 10,
  plannedTimeMin: 1.2, // 1.2 minutes for testing (change to 60+ for real infusions)
  plannedVolumeMl: 12, // 10 ml/min × 1.2 min = 12 ml
};

// Progress tracking state
let progressState = {
  isRunning: false,
  startTime: null,
  elapsedTimeMin: 0,
  deliveredVolumeMl: 0,
  progressInterval: null,
};

console.log("🧪 Testing Infusion Confirmation & Progress Streaming");
console.log(
  `📡 Connecting to MQTT broker: ${brokerOptions.host}:${brokerOptions.port}`
);
console.log(`🔧 Device ID: ${deviceId}`);
console.log(`💉 Infusion Parameters:`, infusionParams);

// Connect to MQTT broker
const client = mqtt.connect(brokerOptions);

client.on("connect", () => {
  console.log("✅ Connected to MQTT broker");

  // Wait 2 seconds then send confirmation
  setTimeout(() => {
    sendInfusionConfirmation();
  }, 2000);
});

client.on("error", (error) => {
  console.error("❌ MQTT Connection Error:", error);
  process.exit(1);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  stopProgressSimulation();
  client.end();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  stopProgressSimulation();
  client.end();
  process.exit(0);
});

function sendInfusionConfirmation() {
  // Use a realistic infusion ID that might match what the backend generates
  const infusionId = `68f39598fd1ed000a9230778`; // Simulate MongoDB ObjectId format (24 chars)

  const confirmationData = {
    confirmed: true,
    infusionId,
    confirmedAt: new Date().toISOString(),
    parameters: infusionParams,
  };

  const topic = `devices/${deviceId}/infusion`;

  console.log("");
  console.log("💉 Sending Infusion Confirmation:");
  console.log(`   Topic: ${topic}`);
  console.log(`   Infusion ID: ${infusionId}`);
  console.log(`   Device ID: ${deviceId}`);
  console.log(`   Confirmed: ${confirmationData.confirmed}`);
  console.log(`   Timestamp: ${confirmationData.confirmedAt}`);
  console.log(`   Full Data:`, JSON.stringify(confirmationData, null, 2));
  console.log("");

  client.publish(topic, JSON.stringify(confirmationData), { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Failed to publish infusion confirmation:", err);
    } else {
      console.log("✅ Infusion confirmation published successfully!");
      console.log("📋 Expected workflow:");
      console.log("   1. Backend receives MQTT message");
      console.log("   2. Backend validates confirmation data");
      console.log('   3. Backend updates device status to "running"');
      console.log('   4. Backend updates infusion status to "confirmed"');
      console.log("   5. Backend streams to Socket.IO");
      console.log("   6. Frontend receives socket event");
      console.log("   7. Modal fetches infusion details from API");
      console.log("   8. Modal transitions to monitoring mode");
      console.log("");
      console.log("🔍 Check logs for:");
      console.log(
        '   Backend: "📥 MQTT Message received - Topic: devices/PUMP_0001/infusion"'
      );
      console.log(
        '   Backend: "💉 Processing infusion confirmation for device PUMP_0001"'
      );
      console.log(
        "   Backend: \"✅ Updated device PUMP_0001 status to 'running' in database\""
      );
      console.log(
        "   Backend: \"✅ Updated infusion [ID] status to 'confirmed' in database\""
      );
      console.log(
        '   Backend: "📡 Streaming infusion confirmation for device PUMP_0001"'
      );
      console.log('   Frontend: "💉 Received infusion confirmation"');
      console.log('   Frontend: "📊 Fetching infusion details for ID"');
      console.log('   Frontend: "🎯 Starting monitoring with infusion data"');
      console.log("");
      console.log("🎬 Next: Starting progress simulation in 3 seconds...");

      // Start progress simulation after confirmation
      setTimeout(() => {
        startProgressSimulation();
      }, 3000);
    }
  });
}

function startProgressSimulation() {
  console.log("🚀 Starting Progress Simulation (Real-Time)");
  console.log(`📊 Flow Rate: ${infusionParams.flowRateMlMin} ml/min`);
  console.log(`⏱️  Planned Time: ${infusionParams.plannedTimeMin} min`);
  console.log(`💧 Planned Volume: ${infusionParams.plannedVolumeMl} ml`);
  console.log(
    `🕐 Real-time simulation: ${infusionParams.plannedTimeMin} minutes actual duration`
  );
  console.log("");

  progressState.isRunning = true;
  progressState.startTime = new Date();
  progressState.elapsedTimeMin = 0;
  progressState.deliveredVolumeMl = 0;

  // Send progress updates every 1 second for maximum real-time feedback
  progressState.progressInterval = setInterval(() => {
    sendProgressUpdate();
  }, 1000);

  // Send initial progress update immediately
  sendProgressUpdate();
}

function sendProgressUpdate() {
  if (!progressState.isRunning) return;

  // Calculate elapsed time in REAL minutes (no acceleration)
  const now = new Date();
  const elapsedMilliseconds = now.getTime() - progressState.startTime.getTime();
  progressState.elapsedTimeMin = elapsedMilliseconds / (1000 * 60); // Convert to actual minutes

  // Calculate delivered volume based on flow rate and REAL elapsed time
  progressState.deliveredVolumeMl = Math.min(
    progressState.elapsedTimeMin * infusionParams.flowRateMlMin,
    infusionParams.plannedVolumeMl
  );

  // Calculate remaining values
  const timeRemainingMin = Math.max(
    0,
    infusionParams.plannedTimeMin - progressState.elapsedTimeMin
  );
  const volumeRemainingMl = Math.max(
    0,
    infusionParams.plannedVolumeMl - progressState.deliveredVolumeMl
  );

  // Calculate completion percentage
  const timeProgressPercent =
    (progressState.elapsedTimeMin / infusionParams.plannedTimeMin) * 100;
  const volumeProgressPercent =
    (progressState.deliveredVolumeMl / infusionParams.plannedVolumeMl) * 100;

  // Progress data in the exact format expected by MQTT service
  const progressData = {
    timeRemainingMin: Math.round(timeRemainingMin * 100) / 100,
    volumeRemainingMl: Math.round(volumeRemainingMl * 100) / 100,
    timestamp: now.toISOString(),
    // Additional fields that might be useful
    elapsedTimeMin: Math.round(progressState.elapsedTimeMin * 100) / 100,
    deliveredVolumeMl: Math.round(progressState.deliveredVolumeMl * 100) / 100,
    progressPercent:
      Math.round(Math.max(timeProgressPercent, volumeProgressPercent) * 100) /
      100,
    flowRate: infusionParams.flowRateMlMin,
    status: "running",
  };

  const topic = `devices/${deviceId}/progress`;

  console.log("📈 Sending Progress Update (Real-Time):");
  console.log(`   Topic: ${topic}`);
  console.log(`   Elapsed: ${progressData.elapsedTimeMin} real minutes`);
  console.log(`   Time Remaining: ${progressData.timeRemainingMin} min`);
  console.log(`   Volume Delivered: ${progressData.deliveredVolumeMl} ml`);
  console.log(`   Volume Remaining: ${progressData.volumeRemainingMl} ml`);
  console.log(`   Progress: ${progressData.progressPercent}%`);
  console.log(`   Flow Rate: ${progressData.flowRate} ml/min`);
  console.log(`   Status: ${progressData.status}`);
  console.log(`   Real Time: ${new Date().toLocaleTimeString()}`);
  console.log("");

  client.publish(topic, JSON.stringify(progressData), { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Failed to publish progress update:", err);
    } else {
      console.log(
        `✅ Progress update published (${progressData.progressPercent.toFixed(1)}% complete)`
      );
      console.log(
        '🔍 Backend should log: "📈 Progress update received for device PUMP_0001"'
      );
      console.log(
        '🔍 Frontend should log: "📈 Received real-time progress update"'
      );
      console.log("");
    }
  });

  // Check if infusion is complete
  if (timeRemainingMin <= 0.01 || volumeRemainingMl <= 0.01) {
    // Small threshold for floating point precision
    console.log("🏁 Infusion Complete - Stopping Progress Simulation");
    stopProgressSimulation();

    // Send completion notification
    setTimeout(() => {
      sendInfusionComplete();
    }, 2000);
  }
}

function stopProgressSimulation() {
  progressState.isRunning = false;
  if (progressState.progressInterval) {
    clearInterval(progressState.progressInterval);
    progressState.progressInterval = null;
  }
}

function sendInfusionComplete() {
  // Send final progress update showing completion
  const finalProgressData = {
    timeRemainingMin: 0,
    volumeRemainingMl: 0,
    timestamp: new Date().toISOString(),
    elapsedTimeMin: Math.round(progressState.elapsedTimeMin * 100) / 100,
    deliveredVolumeMl: Math.round(progressState.deliveredVolumeMl * 100) / 100,
    progressPercent: 100,
    flowRate: infusionParams.flowRateMlMin,
    status: "completed",
  };

  const progressTopic = `devices/${deviceId}/progress`;

  console.log("🎉 Sending Final Progress (Completion):");
  console.log(`   Topic: ${progressTopic}`);
  console.log(`   Total Time: ${finalProgressData.elapsedTimeMin} min`);
  console.log(`   Total Volume: ${finalProgressData.deliveredVolumeMl} ml`);
  console.log(`   Progress: ${finalProgressData.progressPercent}%`);
  console.log(`   Status: ${finalProgressData.status}`);
  console.log("");

  client.publish(
    progressTopic,
    JSON.stringify(finalProgressData),
    { qos: 1 },
    (err) => {
      if (err) {
        console.error("❌ Failed to publish final progress:", err);
      } else {
        console.log("✅ Final progress published successfully!");

        // Send infusion completion notification to new completion topic
        setTimeout(() => {
          const completionData = {
            completed: true,
            completedAt: new Date().toISOString(),
            summary: {
              totalTimeMin: finalProgressData.elapsedTimeMin,
              totalVolumeMl: finalProgressData.deliveredVolumeMl,
              plannedTimeMin: infusionParams.plannedTimeMin,
              plannedVolumeMl: infusionParams.plannedVolumeMl,
              avgFlowRate: infusionParams.flowRateMlMin,
              efficiency: Math.round(
                (finalProgressData.deliveredVolumeMl /
                  infusionParams.plannedVolumeMl) *
                  100
              ),
            },
            deviceStatus: "healthy",
          };

          const completionTopic = `devices/${deviceId}/completion`;

          console.log("🏆 Sending Infusion Completion:");
          console.log(`   Topic: ${completionTopic}`);
          console.log(`   Completed: ${completionData.completed}`);
          console.log(`   Completed At: ${completionData.completedAt}`);
          console.log(
            `   Total Time: ${completionData.summary.totalTimeMin} min`
          );
          console.log(
            `   Total Volume: ${completionData.summary.totalVolumeMl} ml`
          );
          console.log(`   Efficiency: ${completionData.summary.efficiency}%`);
          console.log(`   Device Status: ${completionData.deviceStatus}`);
          console.log("");

          client.publish(
            completionTopic,
            JSON.stringify(completionData),
            { qos: 1 },
            (completionErr) => {
              if (completionErr) {
                console.error(
                  "❌ Failed to publish completion notification:",
                  completionErr
                );
              } else {
                console.log(
                  "✅ Completion notification published successfully!"
                );

                // Send a status update indicating completion
                setTimeout(() => {
                  const statusData = {
                    status: "healthy", // Device returns to healthy after completion
                    lastPing: new Date().toISOString(),
                    timestamp: new Date().toISOString(),
                    infusionComplete: true,
                    summary: {
                      totalTimeMin: finalProgressData.elapsedTimeMin,
                      totalVolumeMl: finalProgressData.deliveredVolumeMl,
                      avgFlowRate: infusionParams.flowRateMlMin,
                      completedAt: new Date().toISOString(),
                    },
                  };

                  const statusTopic = `devices/${deviceId}/status`;

                  console.log("📊 Sending Status Update (Healthy):");
                  console.log(`   Topic: ${statusTopic}`);
                  console.log(`   Status: ${statusData.status}`);
                  console.log(
                    `   Infusion Complete: ${statusData.infusionComplete}`
                  );
                  console.log("");

                  client.publish(
                    statusTopic,
                    JSON.stringify(statusData),
                    { qos: 1 },
                    (statusErr) => {
                      if (statusErr) {
                        console.error(
                          "❌ Failed to publish status update:",
                          statusErr
                        );
                      } else {
                        console.log("✅ Status update published successfully!");
                        console.log("");
                        console.log("🎯 Expected Backend Processing:");
                        console.log(
                          "   1. Backend receives final progress (100% complete)"
                        );
                        console.log(
                          "   2. Backend receives completion notification"
                        );
                        console.log(
                          '   3. Backend updates device status to "healthy"'
                        );
                        console.log(
                          '   4. Backend updates infusion status to "completed"'
                        );
                        console.log(
                          "   5. Backend streams completion to Socket.IO"
                        );
                        console.log("   6. Frontend receives completion event");
                        console.log(
                          "   7. Frontend shows completion notification"
                        );
                        console.log(
                          "   8. Frontend updates device dashboard to healthy state"
                        );
                      }

                      // Exit after completion
                      setTimeout(() => {
                        console.log("🏁 Test completed. Exiting...");
                        client.end();
                        process.exit(0);
                      }, 3000);
                    }
                  );
                }, 1000);
              }
            }
          );
        }, 500);
      }
    }
  );
}

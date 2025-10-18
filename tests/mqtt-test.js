#!/usr/bin/env node

/**
 * MQTT Test Script for Infusion Pump System
 * 
 * This script simulates an infusion pump device by:
 * 1. Connecting to the MQTT broker
 * 2. Publishing device status, progress, and infusion confirmation messages
 * 3. Allowing you to test the complete Socket.IO streaming flow
 * 
 * Usage:
 *   node mqtt-test.js [deviceId]
 * 
 * Example:
 *   node mqtt-test.js PUMP_0001
 */

import mqtt from 'mqtt';

const deviceId = process.argv[2] || 'PUMP_0001';

// MQTT broker configuration - same as main application
const brokerOptions = {
  host: '4ebd6137905848fc8246b374d7253984.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'pump001',
  password: 'Disa@123',
  clean: true,
  connectTimeout: 4000,
  clientId: `test_device_${deviceId}_${Math.random().toString(16).substr(2, 8)}`,
  reconnectPeriod: 1000,
};

console.log(`🚀 Starting MQTT test simulation for device: ${deviceId}`);

// MQTT Configuration - same as main application
const options = {
  host: '4ebd6137905848fc8246b374d7253984.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'pump001',
  password: 'Disa@123',
  clean: true,
  connectTimeout: 4000,
  clientId: `test_device_${deviceId}_${Math.random().toString(16).substr(2, 8)}`,
  reconnectPeriod: 1000,
};

const client = mqtt.connect(options);

// Test data
let timeRemaining = 60; // minutes
let volumeRemaining = 500; // ml
let isInfusionActive = false;
let infusionId = null;

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  console.log('📋 Available commands:');
  console.log('  start - Start infusion and send confirmation');
  console.log('  progress - Send progress update');
  console.log('  error - Send error message');
  console.log('  status - Send status update');
  console.log('  stop - Stop simulation');
  console.log('');
  
  // Send initial status
  sendStatusMessage('healthy');
  
  // Start interactive mode
  startInteractiveMode();
});

client.on('error', (error) => {
  console.error('❌ MQTT Connection Error:', error);
  process.exit(1);
});

function sendInfusionConfirmation() {
  if (isInfusionActive) {
    console.log('⚠️ Infusion already active');
    return;
  }

  infusionId = `INF_${Date.now()}`;
  isInfusionActive = true;
  timeRemaining = 60;
  volumeRemaining = 500;

  const confirmationData = {
    deviceId,
    infusionId,
    confirmed: true,
    confirmedAt: new Date().toISOString(),
    parameters: {
      flowRateMlMin: 10,
      plannedTimeMin: 60,
      plannedVolumeMl: 500
    }
  };

  const topic = `devices/${deviceId}/infusion`;
  client.publish(topic, JSON.stringify(confirmationData), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish infusion confirmation:', err);
    } else {
      console.log(`💉 Published infusion confirmation for ${deviceId}`);
      console.log(`   Infusion ID: ${infusionId}`);
      console.log(`   📋 This should trigger the waiting modal to close!`);
      
      // Start sending regular progress updates
      setTimeout(() => {
        startProgressUpdates();
      }, 2000);
    }
  });
}

function sendProgressMessage() {
  if (!isInfusionActive) {
    console.log('⚠️ No active infusion');
    return;
  }

  // Simulate progress
  timeRemaining = Math.max(0, timeRemaining - 1);
  volumeRemaining = Math.max(0, volumeRemaining - 10);

  const progressData = {
    deviceId,
    infusionId,
    timeRemainingMin: timeRemaining,
    volumeRemainingMl: volumeRemaining,
    timestamp: new Date().toISOString(),
    progressPercent: {
      time: ((60 - timeRemaining) / 60) * 100,
      volume: ((500 - volumeRemaining) / 500) * 100
    }
  };

  const topic = `devices/${deviceId}/progress`;
  client.publish(topic, JSON.stringify(progressData), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish progress:', err);
    } else {
      console.log(`📈 Published progress - Time: ${timeRemaining}min, Volume: ${volumeRemaining}ml`);
    }
  });

  // Stop if infusion is complete
  if (timeRemaining === 0 || volumeRemaining === 0) {
    isInfusionActive = false;
    console.log('✅ Infusion completed');
  }
}

function sendErrorMessage() {
  const errorData = {
    deviceId,
    type: 'FLOW_BLOCKED',
    message: 'Flow sensor detected blockage in line',
    severity: 'HIGH',
    timestamp: new Date().toISOString(),
    errorCode: 'E001'
  };

  const topic = `devices/${deviceId}/error`;
  client.publish(topic, JSON.stringify(errorData), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish error:', err);
    } else {
      console.log(`🚨 Published error: ${errorData.type} - ${errorData.message}`);
    }
  });
}

function sendStatusMessage(status = 'healthy') {
  const statusData = {
    deviceId,
    status,
    lastPing: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
    timestamp: new Date().toISOString(),
    batteryLevel: Math.floor(Math.random() * 100),
    firmwareVersion: '1.2.3'
  };

  const topic = `devices/${deviceId}/status`;
  client.publish(topic, JSON.stringify(statusData), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish status:', err);
    } else {
      console.log(`📊 Published status: ${status}`);
    }
  });
}

function startProgressUpdates() {
  const interval = setInterval(() => {
    if (isInfusionActive) {
      sendProgressMessage();
    } else {
      clearInterval(interval);
    }
  }, 2000); // Send progress every 2 seconds
}

function startInteractiveMode() {
  process.stdin.setEncoding('utf8');
  process.stdin.on('readable', () => {
    const chunk = process.stdin.read();
    if (chunk !== null) {
      const command = chunk.trim().toLowerCase();
      
      switch (command) {
        case 'start':
          sendInfusionConfirmation();
          break;
        case 'progress':
          sendProgressMessage();
          break;
        case 'error':
          sendErrorMessage();
          break;
        case 'status':
          sendStatusMessage();
          break;
        case 'stop':
          console.log('🛑 Stopping simulation...');
          client.end();
          process.exit(0);
          break;
        case 'help':
          console.log('📋 Available commands: start, progress, error, status, stop');
          break;
        default:
          if (command) {
            console.log(`❓ Unknown command: ${command}. Type 'help' for available commands.`);
          }
      }
    }
  });

  console.log('💭 Type commands and press Enter (type "help" for options):');
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  client.end();
  process.exit(0);
});
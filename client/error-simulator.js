#!/usr/bin/env node

/**
 * ESP32 Error Simulation for Testing Error Streaming Pipeline
 * 
 * This script simulates device errors being sent via MQTT to test:
 * - MQTT error handling and Redis caching
 * - Socket.IO error streaming
 * - Frontend notifications and error modal
 * 
 * Error Types Simulated:
 * - High severity: Critical pump failure (shows modal)
 * - Medium severity: Flow rate deviation (notification only)
 * - Low severity: Sensor reading anomaly (notification only)
 */

import mqtt from 'mqtt';

// Configuration - using the same MQTT broker as the main application
const deviceId = 'PUMP_0001';
const brokerOptions = {
  host: '4ebd6137905848fc8246b374d7253984.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'pump001',
  password: 'Disa@123',
  clean: true,
  connectTimeout: 4000,
  clientId: `error_simulator_${Math.random().toString(16).substr(2, 8)}`,
  reconnectPeriod: 1000,
};

// Error scenarios to simulate
const errorScenarios = [
  {
    type: 'pump_failure',
    severity: 'high',
    message: 'Critical pump motor failure detected',
    details: {
      motorSpeed: 0,
      expectedSpeed: 150,
      voltage: 11.2,
      temperature: 85,
      errorCode: 'E001'
    }
  },
  {
    type: 'flow_rate_deviation',
    severity: 'medium', 
    message: 'Flow rate deviating from target by 15%',
    details: {
      currentFlowRate: 8.5,
      targetFlowRate: 10.0,
      deviation: 15,
      duration: 45
    }
  },
  {
    type: 'sensor_anomaly',
    severity: 'low',
    message: 'Pressure sensor reading inconsistent',
    details: {
      sensorReading: 23.4,
      expectedRange: [25.0, 30.0],
      sensorId: 'PS_001'
    }
  },
  {
    type: 'connection_issue',
    severity: 'medium',
    message: 'Intermittent network connectivity detected',
    details: {
      packetLoss: 12,
      latency: 850,
      signalStrength: -78
    }
  },
  {
    type: 'battery_low',
    severity: 'high',
    message: 'Emergency battery level critically low',
    details: {
      batteryLevel: 5,
      estimatedTime: 3,
      lastCharged: '2024-10-15T14:30:00Z'
    }
  }
];

console.log('🚨 Error Simulation Starting');
console.log(`📡 Connecting to MQTT broker: ${brokerOptions.host}:${brokerOptions.port}`);
console.log(`🔧 Device ID: ${deviceId}`);
console.log('🎵 Audio alerts will be tested with each error type:');
console.log('   🚨 HIGH severity → Error sound + Modal');
console.log('   ⚠️  MEDIUM severity → Warning sound + Notification');  
console.log('   ℹ️  LOW severity → Info sound + Notification');

// Connect to MQTT broker
const client = mqtt.connect(brokerOptions);

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  console.log('');
  console.log('🎬 Starting error simulation sequence...');
  console.log('⚠️  Will send 5 different error types over 30 seconds');
  console.log('🔍 Watch backend logs and frontend for error handling');
  console.log('🎵 Listen for audio alerts - enable sound in notifications popover!');
  console.log('');
  
  startErrorSimulation();
});

client.on('error', (error) => {
  console.error('❌ MQTT Connection Error:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  client.end();
  process.exit(0);
});

function startErrorSimulation() {
  let errorIndex = 0;
  
  const sendNextError = () => {
    if (errorIndex >= errorScenarios.length) {
      console.log('');
      console.log('🏁 Error simulation completed!');
      console.log('📋 Summary:');
      console.log(`   • Sent ${errorScenarios.length} different error types`);
      console.log('   • Each error cached in Redis for 5 minutes');
      console.log('   • High severity errors should show modal + error sound');
      console.log('   • Medium/Low errors show notifications + warning/info sounds');
      console.log('   • Sound can be toggled in notifications popover');
      console.log('');
      setTimeout(() => {
        client.end();
        process.exit(0);
      }, 2000);
      return;
    }
    
    const scenario = errorScenarios[errorIndex];
    sendDeviceError(scenario);
    errorIndex++;
    
    // Send next error after 6 seconds
    setTimeout(sendNextError, 6000);
  };
  
  // Start sending errors immediately
  sendNextError();
}

function sendDeviceError(scenario) {
  const errorData = {
    type: scenario.type,
    severity: scenario.severity,
    message: scenario.message,
    details: scenario.details,
    timestamp: new Date().toISOString(),
    deviceId: deviceId
  };

  const topic = `devices/${deviceId}/error`;
  
  console.log(`🚨 Sending ${scenario.severity.toUpperCase()} severity error:`);
  console.log(`   Topic: ${topic}`);
  console.log(`   Type: ${scenario.type}`);
  console.log(`   Message: ${scenario.message}`);
  console.log(`   Severity: ${scenario.severity}`);
  console.log(`   Timestamp: ${errorData.timestamp}`);
  console.log(`   Details:`, scenario.details);
  console.log('');
  
  client.publish(topic, JSON.stringify(errorData), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish error:', err);
    } else {
      console.log(`✅ Error published successfully (${scenario.severity} severity)`);
      console.log('🔍 Expected Backend Processing:');
      console.log('   1. MQTT service receives error message');
      console.log('   2. Error cached in Redis for 5 minutes');
      console.log('   3. Notification created and cached');
      console.log('   4. Socket.IO streams error and notification');
      console.log('   5. Frontend shows notification + plays sound');
      if (scenario.severity === 'high') {
        console.log('   6. 🚨 HIGH SEVERITY: Modal appears + error sound plays!');
      } else if (scenario.severity === 'medium') {
        console.log('   6. ⚠️ MEDIUM SEVERITY: Warning sound plays');
      } else {
        console.log('   6. ℹ️ LOW SEVERITY: Info sound plays');
      }
      console.log('');
    }
  });
}
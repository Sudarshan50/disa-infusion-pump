#!/usr/bin/env node

// const mqtt = require('mqtt');
import mqtt from 'mqtt';

// Configuration - using the same MQTT broker as the main application
const deviceId = 'PUMP_0001'; // Changed to match the frontend device ID
const brokerOptions = {
  host: '4ebd6137905848fc8246b374d7253984.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'pump001',
  password: 'Disa@123',
  clean: true,
  connectTimeout: 4000,
  clientId: `test_device_${Math.random().toString(16).substr(2, 8)}`,
  reconnectPeriod: 1000,
};

console.log('🧪 Testing Infusion Confirmation Flow');
console.log(`📡 Connecting to MQTT broker: ${brokerOptions.host}:${brokerOptions.port}`);
console.log(`🔧 Device ID: ${deviceId}`);

// Connect to MQTT broker
const client = mqtt.connect(brokerOptions);

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  
  // Wait 2 seconds then send confirmation
  setTimeout(() => {
    sendInfusionConfirmation();
  }, 2000);
});

client.on('error', (error) => {
  console.error('❌ MQTT Connection Error:', error);
  process.exit(1);
});

function sendInfusionConfirmation() {
  // Use a realistic infusion ID that might match what the backend generates
  const infusionId = `68f36eb8a8f6e4fe2acf5047`; // Simulate MongoDB ObjectId format (24 chars)
  
  const confirmationData = {
    confirmed: true,
    infusionId,
    confirmedAt: new Date().toISOString(),
    parameters: {
      flowRateMlMin: 10,
      plannedTimeMin: 60,
      plannedVolumeMl: 500
    }
  };

  const topic = `devices/${deviceId}/infusion`;
  
  console.log('');
  console.log('💉 Sending Infusion Confirmation:');
  console.log(`   Topic: ${topic}`);
  console.log(`   Infusion ID: ${infusionId}`);
  console.log(`   Device ID: ${deviceId}`);
  console.log(`   Confirmed: ${confirmationData.confirmed}`);
  console.log(`   Timestamp: ${confirmationData.confirmedAt}`);
  console.log(`   Full Data:`, JSON.stringify(confirmationData, null, 2));
  console.log('');
  
  client.publish(topic, JSON.stringify(confirmationData), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish infusion confirmation:', err);
    } else {
      console.log('✅ Infusion confirmation published successfully!');
      console.log('📋 Expected workflow:');
      console.log('   1. Backend receives MQTT message');
      console.log('   2. Backend validates confirmation data');
      console.log('   3. Backend updates device status to "running"');
      console.log('   4. Backend updates infusion status to "confirmed"');
      console.log('   5. Backend streams to Socket.IO');
      console.log('   6. Frontend receives socket event');
      console.log('   7. Modal fetches infusion details from API');
      console.log('   8. Modal transitions to monitoring mode');
      console.log('');
      console.log('🔍 Check logs for:');
      console.log('   Backend: "📥 MQTT Message received - Topic: devices/PUMP_0001/infusion"');
      console.log('   Backend: "💉 Processing infusion confirmation for device PUMP_0001"');
      console.log('   Backend: "✅ Updated device PUMP_0001 status to \'running\' in database"');
      console.log('   Backend: "✅ Updated infusion [ID] status to \'confirmed\' in database"');
      console.log('   Backend: "📡 Streaming infusion confirmation for device PUMP_0001"');
      console.log('   Frontend: "💉 Received infusion confirmation"');
      console.log('   Frontend: "📊 Fetching infusion details for ID"');
      console.log('   Frontend: "🎯 Starting monitoring with infusion data"');
      
      // Exit after 15 seconds to allow time to check logs
      setTimeout(() => {
        console.log('🏁 Test completed. Exiting...');
        client.end();
        process.exit(0);
      }, 15000);
    }
  });
}
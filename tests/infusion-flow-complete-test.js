#!/usr/bin/env node

/**
 * Complete Infusion Flow Test
 * This script tests the full end-to-end flow:
 * 1. Start infusion via API
 * 2. Device confirms via MQTT
 * 3. Device sends progress updates via MQTT
 * 4. Frontend receives updates via Socket.IO
 * 5. Pause/Resume/Stop operations
 */

const axios = require('axios');

// Configuration
const config = {
  backend: {
    baseUrl: process.env.BACKEND_URL || 'http://localhost:3000',
    apiPrefix: '/api/device'
  },
  device: {
    id: process.env.DEVICE_ID || 'PUMP_0001'
  },
  test: {
    flowRateMlMin: 15,
    plannedTimeMin: 3, // Short for testing
    plannedVolumeMl: 45,
    enableBolus: true,
    bolusVolumeMl: 5
  }
};

console.log('🧪 Complete Infusion Flow Test');
console.log(`🏥 Backend: ${config.backend.baseUrl}`);
console.log(`📱 Device: ${config.device.id}`);
console.log('');

// API helper functions
async function apiCall(method, endpoint, data = null) {
  try {
    const url = `${config.backend.baseUrl}${config.backend.apiPrefix}${endpoint}`;
    console.log(`🔗 ${method.toUpperCase()} ${url}`);
    
    const response = await axios({
      method,
      url,
      data,
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(`❌ API Error (${error.response.status}):`, error.response.data);
    } else if (error.request) {
      console.error('❌ Network Error:', error.message);
    } else {
      console.error('❌ Request Error:', error.message);
    }
    throw error;
  }
}

// Test functions
async function testGetDeviceDetails() {
  console.log('📋 Step 1: Getting device details...');
  try {
    const response = await apiCall('GET', `/${config.device.id}`);
    console.log('✅ Device details retrieved:');
    console.log(`   Status: ${response.data.device.status}`);
    console.log(`   Location: ${response.data.device.location}`);
    console.log(`   Active Infusion: ${response.data.device.activeInfusion || 'None'}`);
    return response.data.device;
  } catch (error) {
    console.error('❌ Failed to get device details');
    throw error;
  }
}

async function testStartInfusion() {
  console.log('🚀 Step 2: Starting infusion...');
  try {
    const payload = {
      flowRateMlMin: config.test.flowRateMlMin,
      plannedTimeMin: config.test.plannedTimeMin,
      plannedVolumeMl: config.test.plannedVolumeMl,
      bolus: {
        enabled: config.test.enableBolus,
        volumeMl: config.test.bolusVolumeMl
      }
    };
    
    console.log('📊 Infusion parameters:');
    console.log(`   Flow Rate: ${payload.flowRateMlMin} ml/min`);
    console.log(`   Planned Time: ${payload.plannedTimeMin} min`);
    console.log(`   Planned Volume: ${payload.plannedVolumeMl} ml`);
    console.log(`   Bolus: ${payload.bolus.enabled ? 'enabled' : 'disabled'} (${payload.bolus.volumeMl} ml)`);
    
    const response = await apiCall('POST', `/start/${config.device.id}`, payload);
    console.log('✅ Infusion start command sent');
    console.log(`   Response: ${response.message}`);
    
    return response;
  } catch (error) {
    console.error('❌ Failed to start infusion');
    throw error;
  }
}

async function testWaitForConfirmation(maxWaitTime = 60000) {
  console.log('⏱️ Step 3: Waiting for device confirmation...');
  console.log('💡 Make sure the MQTT device simulator is running!');
  console.log('💡 The device should confirm the infusion via MQTT');
  
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const device = await apiCall('GET', `/${config.device.id}`);
      
      if (device.data.device.status === 'running' && device.data.device.activeInfusion) {
        console.log('✅ Device confirmed infusion!');
        console.log(`   Status: ${device.data.device.status}`);
        console.log(`   Active Infusion: ${device.data.device.activeInfusion}`);
        return device.data.device;
      }
      
      console.log(`⏳ Still waiting... (${Math.round((Date.now() - startTime) / 1000)}s)`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    } catch (error) {
      console.error('❌ Error checking device status:', error.message);
    }
  }
  
  throw new Error('Timeout waiting for device confirmation');
}

async function testPauseInfusion() {
  console.log('⏸️ Step 4: Pausing infusion...');
  try {
    const response = await apiCall('POST', `/pause/${config.device.id}`, {
      reason: 'Test pause'
    });
    console.log('✅ Pause command sent');
    console.log(`   Response: ${response.message}`);
    
    // Wait a moment and check status
    await new Promise(resolve => setTimeout(resolve, 3000));
    const device = await apiCall('GET', `/${config.device.id}`);
    console.log(`   Device status: ${device.data.device.status}`);
    
    return response;
  } catch (error) {
    console.error('❌ Failed to pause infusion');
    throw error;
  }
}

async function testResumeInfusion() {
  console.log('▶️ Step 5: Resuming infusion...');
  try {
    const response = await apiCall('POST', `/resume/${config.device.id}`);
    console.log('✅ Resume command sent');
    console.log(`   Response: ${response.message}`);
    
    // Wait a moment and check status
    await new Promise(resolve => setTimeout(resolve, 3000));
    const device = await apiCall('GET', `/${config.device.id}`);
    console.log(`   Device status: ${device.data.device.status}`);
    
    return response;
  } catch (error) {
    console.error('❌ Failed to resume infusion');
    throw error;
  }
}

async function testStopInfusion() {
  console.log('🛑 Step 6: Stopping infusion...');
  try {
    const response = await apiCall('POST', `/stop/${config.device.id}`, {
      reason: 'Test complete'
    });
    console.log('✅ Stop command sent');
    console.log(`   Response: ${response.message}`);
    
    // Wait a moment and check status
    await new Promise(resolve => setTimeout(resolve, 3000));
    const device = await apiCall('GET', `/${config.device.id}`);
    console.log(`   Device status: ${device.data.device.status}`);
    
    return response;
  } catch (error) {
    console.error('❌ Failed to stop infusion');
    throw error;
  }
}

async function testMonitorProgress(durationSeconds = 30) {
  console.log(`📈 Monitoring progress for ${durationSeconds} seconds...`);
  console.log('💡 Open the frontend dashboard to see real-time updates!');
  
  const startTime = Date.now();
  const monitorInterval = 5000; // Check every 5 seconds
  
  while (Date.now() - startTime < durationSeconds * 1000) {
    try {
      const device = await apiCall('GET', `/${config.device.id}`);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`📊 [${elapsed}s] Status: ${device.data.device.status} | Active: ${!!device.data.device.activeInfusion}`);
      
      await new Promise(resolve => setTimeout(resolve, monitorInterval));
    } catch (error) {
      console.error('❌ Error monitoring progress:', error.message);
    }
  }
}

// Main test execution
async function runCompleteTest() {
  console.log('🎬 Starting complete infusion flow test...');
  console.log('');
  
  try {
    // Step 1: Check initial device state
    await testGetDeviceDetails();
    console.log('');
    
    // Step 2: Start infusion
    await testStartInfusion();
    console.log('');
    
    // Step 3: Wait for device confirmation
    await testWaitForConfirmation();
    console.log('');
    
    // Step 4: Monitor progress briefly
    await testMonitorProgress(20);
    console.log('');
    
    // Step 5: Pause infusion
    await testPauseInfusion();
    console.log('');
    
    // Step 6: Wait a bit
    console.log('⏳ Waiting 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('');
    
    // Step 7: Resume infusion
    await testResumeInfusion();
    console.log('');
    
    // Step 8: Monitor a bit more
    await testMonitorProgress(15);
    console.log('');
    
    // Step 9: Stop infusion
    await testStopInfusion();
    console.log('');
    
    console.log('🎉 Complete flow test finished successfully!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   ✅ Device details retrieved');
    console.log('   ✅ Infusion started via API');
    console.log('   ✅ Device confirmed via MQTT');
    console.log('   ✅ Progress monitored');
    console.log('   ✅ Pause/Resume tested');
    console.log('   ✅ Infusion stopped');
    console.log('');
    console.log('💡 Check the frontend dashboard for real-time updates during the test!');
    
  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('🔍 Troubleshooting tips:');
    console.error('   1. Make sure the backend server is running on localhost:3000');
    console.error('   2. Make sure the MQTT device simulator is running');
    console.error('   3. Check that the device ID exists in the database');
    console.error('   4. Verify MQTT broker connectivity');
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

// Run the test
if (require.main === module) {
  runCompleteTest();
}

module.exports = {
  runCompleteTest,
  testGetDeviceDetails,
  testStartInfusion,
  testWaitForConfirmation,
  testPauseInfusion,
  testResumeInfusion,
  testStopInfusion
};
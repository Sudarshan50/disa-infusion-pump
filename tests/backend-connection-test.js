#!/usr/bin/env node

const { io } = require('socket.io-client');

console.log('🔍 Testing backend server connectivity...');
console.log('');

// Test 1: Check if backend server is responding
console.log('📡 Test 1: Checking if backend server is running...');
const http = require('http');

const checkServerHealth = () => {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000', (res) => {
      console.log('✅ Backend server is responding');
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Headers: ${JSON.stringify(res.headers, null, 2)}`);
      resolve(true);
    });

    req.on('error', (err) => {
      console.error('❌ Backend server is not responding:', err.message);
      if (err.code === 'ECONNREFUSED') {
        console.error('   The server is not running on localhost:3000');
        console.error('   Please start the backend server with: npm start');
      }
      resolve(false);
    });

    req.setTimeout(5000, () => {
      console.error('❌ Request timeout - server is not responding');
      req.destroy();
      resolve(false);
    });
  });
};

// Test 2: Test Socket.IO connection
const testSocketConnection = () => {
  return new Promise((resolve) => {
    console.log('');
    console.log('🔌 Test 2: Testing Socket.IO connection...');
    
    const socket = io('http://localhost:3000', {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: false
    });

    const timeout = setTimeout(() => {
      console.error('❌ Socket.IO connection timeout after 10 seconds');
      socket.disconnect();
      resolve(false);
    }, 10000);

    socket.on('connect', () => {
      console.log('✅ Socket.IO connection successful!');
      console.log(`   Socket ID: ${socket.id}`);
      clearTimeout(timeout);
      
      // Test device subscription
      console.log('📡 Testing device subscription...');
      socket.emit('subscribe:device', { deviceId: 'PUMP_0001' });
      
      socket.on('stream:subscribed', (data) => {
        console.log('✅ Device subscription successful:', data);
        socket.disconnect();
        resolve(true);
      });
      
      socket.on('error', (error) => {
        console.error('❌ Device subscription error:', error);
        socket.disconnect();
        resolve(false);
      });
      
      // Timeout for subscription test
      setTimeout(() => {
        console.log('⚠️ Device subscription test completed (no response)');
        socket.disconnect();
        resolve(true); // Connection worked, just no subscription response
      }, 3000);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection failed:', error.message);
      clearTimeout(timeout);
      resolve(false);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket.IO disconnected:', reason);
    });
  });
};

// Run tests
async function runTests() {
  const serverRunning = await checkServerHealth();
  
  if (serverRunning) {
    const socketWorking = await testSocketConnection();
    
    console.log('');
    console.log('📋 Test Summary:');
    console.log(`   Backend Server: ${serverRunning ? '✅ Running' : '❌ Not Running'}`);
    console.log(`   Socket.IO: ${socketWorking ? '✅ Working' : '❌ Not Working'}`);
    
    if (serverRunning && socketWorking) {
      console.log('');
      console.log('🎉 All tests passed! Your backend is ready for connections.');
      console.log('   You can now test the frontend modal connection.');
    } else if (serverRunning && !socketWorking) {
      console.log('');
      console.log('⚠️ Server is running but Socket.IO is not working properly.');
      console.log('   Check if Socket.IO is properly initialized in your backend.');
    }
  } else {
    console.log('');
    console.log('❌ Backend server is not running.');
    console.log('   Please start it with: cd /Users/sudarshan/Documents/infusion-calm && npm start');
  }
  
  console.log('');
  console.log('🏁 Backend connectivity test completed.');
  process.exit(0);
}

runTests().catch(console.error);
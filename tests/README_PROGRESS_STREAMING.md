# Complete Device Progress Streaming Test Guide

This guide explains how to test the complete end-to-end flow for device progress streaming from ESP32 → MQTT → Backend → Socket.IO → Frontend Dashboard.

## Architecture Overview

```
ESP32/Device Simulator → MQTT Broker → Backend → Socket.IO → Frontend Dashboard
                                          ↓
                                      Database Updates
```

## Test Components

### 1. **MQTT Device Simulator** (`mqtt-device-simulator.js`)
- Simulates an ESP32 infusion pump device
- Responds to MQTT commands from backend
- Sends infusion confirmations and progress updates
- Interactive commands for testing

### 2. **Complete Flow Test** (`infusion-flow-complete-test.js`)
- Automated test of the entire flow
- Tests API calls, MQTT confirmations, and progress monitoring
- Validates pause/resume/stop operations

### 3. **Frontend Dashboard**
- Real-time progress updates via Socket.IO
- Live connection indicator
- Progress visualization with time/volume switching

## Setup Instructions

### Prerequisites
```bash
# Install dependencies for tests
cd tests
npm install mqtt axios readline

# Make sure backend is running
cd ..
npm install
npm start

# Make sure frontend is running
cd client
npm install
npm run dev
```

### Environment Variables
Create a `.env` file in the project root:
```env
# MQTT Configuration (HiveMQ Cloud)
HIVEMQ_HOST=your-hivemq-cluster.s1.eu.hivemq.cloud
HIVEMQ_PORT=8883
HIVEMQ_USERNAME=your-username
HIVEMQ_PASSWORD=your-password

# Database
MONGODB_URI=mongodb://localhost:27017/infusion-calm

# Server
PORT=3000
```

## Running the Tests

### Method 1: Automated Complete Flow Test

1. **Start the backend server:**
   ```bash
   npm start
   ```

2. **Start the MQTT device simulator:**
   ```bash
   cd tests
   node mqtt-device-simulator.js
   ```

3. **Run the complete flow test:**
   ```bash
   # In another terminal
   cd tests
   node infusion-flow-complete-test.js
   ```

4. **Open the frontend dashboard:**
   ```bash
   cd client
   npm run dev
   # Open http://localhost:5173/device/PUMP_0001
   ```

### Method 2: Manual Step-by-Step Testing

1. **Start all services** (backend, frontend, MQTT simulator)

2. **In the device simulator, run the flow simulation:**
   ```
   flow
   ```
   This will automatically simulate: start → confirm → progress → pause → resume → complete

3. **Watch the frontend dashboard** for real-time updates

### Method 3: Frontend-Initiated Testing

1. **Start backend and MQTT simulator**

2. **Open frontend dashboard:** `http://localhost:5173/device/PUMP_0001`

3. **Start an infusion** using the frontend "Start Infusion" wizard

4. **Watch real-time updates** as the device confirms and sends progress

## What to Expect

### 1. **Initial State**
- Frontend shows device as "Healthy"
- Socket connection indicator shows "Live" (green wifi icon)
- No active infusion

### 2. **After Starting Infusion**
- Frontend sends start command to backend
- Backend sends MQTT command to device
- Device confirms via MQTT → Backend updates database → Socket.IO streams to frontend
- Frontend shows "Running" status with infusion details

### 3. **During Progress Updates**
- Device sends progress every 2 seconds via MQTT
- Backend streams to frontend via Socket.IO
- Frontend updates progress bars and remaining time/volume in real-time
- Progress timestamp updates live

### 4. **Pause/Resume Operations**
- Frontend → Backend → MQTT → Device → MQTT → Backend → Socket.IO → Frontend
- Status changes to "Paused" (yellow) / "Running" (orange)
- Progress updates stop/resume accordingly

### 5. **Completion**
- Device automatically completes when time/volume reaches zero
- Status updates to "Completed"
- Progress shows 100%

## Key Features Tested

### Real-time Updates
- ✅ Infusion confirmation streaming
- ✅ Progress updates (time and volume remaining)
- ✅ Status changes (running/paused/stopped)
- ✅ Live connection indicators

### Data Flow
- ✅ ESP32/Device → MQTT → Backend database updates
- ✅ Backend → Socket.IO → Frontend real-time display
- ✅ Bidirectional commands (start/pause/resume/stop)

### Error Handling
- ✅ Connection loss detection
- ✅ Timeout handling for confirmations
- ✅ Graceful degradation when offline

### UI Features
- ✅ Progress mode switching (time ↔ volume)
- ✅ Real-time timestamps
- ✅ Patient details handling (including skipped scenarios)
- ✅ Modal "View Details" with live data

## Troubleshooting

### Common Issues

1. **"Backend server is not running"**
   - Make sure `npm start` is running on port 3000
   - Check for port conflicts

2. **"MQTT connection failed"**
   - Verify MQTT credentials in `.env`
   - Check HiveMQ Cloud dashboard for connection limits

3. **"Device confirmation timeout"**
   - Ensure MQTT device simulator is running
   - Check device ID matches (`PUMP_0001` by default)

4. **"Socket not connected"**
   - Refresh frontend page
   - Check browser console for connection errors
   - Verify backend Socket.IO is initialized

### Debug Commands

**Device Simulator:**
```
help    # Show available commands
status  # Show current device state
flow    # Run complete simulation
error   # Simulate device error
```

**API Testing:**
```bash
# Check device status
curl http://localhost:3000/api/device/PUMP_0001

# Start infusion
curl -X POST http://localhost:3000/api/device/start/PUMP_0001 \
  -H "Content-Type: application/json" \
  -d '{"flowRateMlMin":15,"plannedTimeMin":5,"plannedVolumeMl":75}'
```

## Expected Data Flow

### 1. Infusion Start
```json
Frontend → Backend API → MQTT Command → Device
{
  "command": "START_INFUSION",
  "payload": {
    "infusionId": "...",
    "flowRateMlMin": 15,
    "plannedTimeMin": 5,
    "plannedVolumeMl": 75
  }
}
```

### 2. Device Confirmation
```json
Device → MQTT → Backend → Socket.IO → Frontend
{
  "infusionId": "...",
  "confirmed": true,
  "confirmedAt": "2025-10-18T...",
  "parameters": {...}
}
```

### 3. Progress Updates
```json
Device → MQTT → Backend → Socket.IO → Frontend
{
  "deviceId": "PUMP_0001",
  "infusionId": "...",
  "timeRemainingMin": 4.5,
  "volumeRemainingMl": 67.5,
  "timestamp": "2025-10-18T...",
  "progressPercent": {
    "time": 10,
    "volume": 10
  }
}
```

This setup provides a complete test environment for validating the entire device progress streaming pipeline!
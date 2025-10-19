# Infusion Pump Real-time Streaming System

This project has been refactored to use a simplified Socket.IO streaming architecture for real-time device monitoring, replacing the previous Redis-based approach.

## Architecture Overview

### Backend Components

1. **MQTT Service** (`src/lib/mqtt.js`)
   - Receives device messages from topics: `devices/+/progress`, `devices/+/error`, `devices/+/infusion`
   - Streams data directly to Socket.IO clients (no Redis dependency)

2. **Socket.IO Service** (`src/lib/socket.js`)
   - Manages real-time client connections
   - Uses in-memory state management with `deviceStreams` Map
   - Provides streaming methods: `streamProgressData`, `streamErrorData`, `streamInfusionConfirmation`, `streamStatusData`

### Frontend Components

1. **Socket Service** (`client/src/lib/socketService.ts`)
   - Simple Socket.IO client wrapper
   - Handles device subscription and real-time data streaming
   - Provides device confirmation waiting functionality

2. **React Hook** (`client/src/hooks/useDeviceSocket.ts`)
   - React hook for device streaming integration
   - Auto-connection and subscription management
   - Real-time state updates for progress, errors, status, and confirmations

3. **Waiting Modal** (`client/src/components/WaitingForDeviceModal.tsx`)
   - Shows spinner while waiting for device confirmation
   - Uses Socket.IO for real-time device response
   - Handles timeout and error scenarios

## Event Structure

### Socket.IO Events

**Client → Server:**

- `subscribe:device` - Subscribe to device updates
- `unsubscribe:device` - Unsubscribe from device updates

**Server → Client:**

- `device:progress` - Device progress updates
- `device:error` - Device error notifications
- `device:status` - Device status updates
- `device:infusion:confirmed` - Infusion confirmation from device

### MQTT Topics

**Device → Server:**

- `devices/{deviceId}/progress` - Progress updates during infusion
- `devices/{deviceId}/error` - Error notifications from device
- `devices/{deviceId}/infusion` - Infusion confirmation from device
- `devices/{deviceId}/status` - Device status updates

## Testing

### Backend Testing

1. Start the backend server
2. Open `tests/device-monitor.html` in browser
3. Subscribe to a device (e.g., PUMP_0001)

### MQTT Testing

1. Configure MQTT credentials in environment variables
2. Run the test simulator: `node tests/mqtt-test.js PUMP_0001`
3. Use interactive commands:
   - `start` - Send infusion confirmation
   - `progress` - Send progress update
   - `error` - Send error message
   - `status` - Send status update

### Complete Flow Testing

1. Start backend server
2. Open frontend application
3. Navigate to device wizard
4. Click "Start Infusion" → Waiting modal appears
5. Run MQTT test script and type `start` → Device confirms
6. Modal closes and real-time monitoring begins

## Key Improvements

1. **Simplified Architecture**: Removed Redis dependency for direct MQTT → Socket.IO streaming
2. **Better Performance**: In-memory state management reduces latency
3. **Cleaner Code**: Simplified event structure and fewer dependencies
4. **Real-time Confirmation**: Device confirmation flow using Socket.IO waiting mechanism
5. **Improved Testing**: Better test tools for end-to-end validation

## Environment Variables

```bash
# MQTT Configuration
HIVEMQ_HOST=your-hivemq-cluster.s1.eu.hivemq.cloud
HIVEMQ_PORT=8883
HIVEMQ_USERNAME=your-username
HIVEMQ_PASSWORD=your-password
```

## Next Steps

1. Configure real MQTT credentials
2. Test with physical devices
3. Add authentication to Socket.IO connections
4. Implement device recovery mechanisms
5. Add monitoring and logging for production use

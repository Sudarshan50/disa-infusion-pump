# Infusion Device Confirmation Flow

This document explains the complete end-to-end flow from when a user clicks the "Start" button to when they begin monitoring device progress in real-time.

## Overview

The implementation creates a sophisticated flow that ensures proper device confirmation before proceeding to real-time monitoring:

1. **User clicks Start** → Waiting modal appears
2. **Backend sends MQTT command** → Device receives start command
3. **Device confirms via MQTT** → Backend receives confirmation
4. **Socket.IO broadcasts** → Frontend receives confirmation
5. **Modal closes** → User proceeds to device monitoring
6. **Real-time updates** → Progress tracking begins

## Frontend Components

### 1. WaitingForDeviceModal
- **Purpose**: Shows a spinner while waiting for device confirmation
- **Features**:
  - 30-second timeout for device response
  - Success/error states with appropriate messaging
  - Cancellation support
  - Automatic progression after confirmation

### 2. Updated WizardStep3
- **Integration**: Now includes the waiting modal
- **Flow**: Start button → Modal → Device confirmation → Next step
- **Props**: Added `onDeviceConfirmed` callback for handling confirmation

## Backend Implementation

### 1. MQTT Service Updates
- **New Handler**: `handleInfusionConfirmation(deviceId, data)`
- **Topic**: Listens to `devices/+/infusion` messages
- **Validation**: Ensures `infusionId` is present in confirmation
- **Storage**: Caches confirmation in Redis for 10 minutes
- **Notification**: Triggers Socket.IO event for real-time updates

### 2. Socket.IO Service Updates
- **New Events**: 
  - `subscribe:device:infusion` - Subscribe to device infusion events
  - `device:infusion:confirmed` - Emitted when device confirms
- **New Methods**:
  - `subscribeToDeviceInfusion()` - Handle infusion subscriptions
  - `sendRecentInfusionConfirmation()` - Send cached confirmations
  - `notifyInfusionConfirmation()` - Broadcast confirmations

### 3. Device Controller
- **Enhanced**: Start infusion endpoint creates infusion record
- **Infusion ID**: Generates and sends MongoDB `_id` to device
- **Patient Support**: Handles both patient details and skipped patient scenarios

## Device Communication Protocol

### 1. Command Flow (Backend → Device)
```json
// Topic: devices/{deviceId}/commands
{
  "command": "START_INFUSION",
  "payload": {
    "flowRateMlMin": 10,
    "plannedTimeMin": 60,
    "plannedVolumeMl": 600,
    "bolus": {
      "enabled": true,
      "volumeMl": 50
    },
    "infusionId": "67123abc456def789012345"
  },
  "timestamp": "2024-10-18T10:30:00.000Z",
  "commandId": "cmd_abc123"
}
```

### 2. Confirmation Flow (Device → Backend)
```json
// Topic: devices/{deviceId}/infusion
{
  "deviceId": "PUMP_0001",
  "infusionId": "67123abc456def789012345",
  "status": "confirmed",
  "message": "Infusion started successfully",
  "timestamp": "2024-10-18T10:30:05.000Z",
  "parameters": {
    "flowRateMlMin": 10,
    "plannedTimeMin": 60,
    "plannedVolumeMl": 600,
    "bolusEnabled": true,
    "bolusVolumeMl": 50
  }
}
```

### 3. Progress Updates (Device → Backend)
```json
// Topic: devices/{deviceId}/progress
{
  "deviceId": "PUMP_0001",
  "infusionId": "67123abc456def789012345",
  "timeRemainingMin": 45.5,
  "volumeRemainingMl": 455.0,
  "timestamp": "2024-10-18T10:45:00.000Z",
  "progressPercent": {
    "time": 24.2,
    "volume": 24.2
  }
}
```

## API Endpoints

### 1. Start Infusion
```http
POST /api/device/{deviceId}/start
Content-Type: application/json

{
  "flowRateMlMin": 10,
  "plannedTimeMin": 60,
  "plannedVolumeMl": 600,
  "bolus": {
    "enabled": true,
    "volumeMl": 50
  },
  "patient": {
    "name": "John Doe",
    "age": 45,
    "weight": 70,
    "bedNo": "ICU-101",
    "drugInfused": "Saline Solution",
    "allergies": "None"
  }
}
```

### 2. Get Infusion Details
```http
POST /api/device/{deviceId}/infusion
Content-Type: application/json

{
  "infusionId": "67123abc456def789012345"
}
```

## Real-time Communication

### 1. Socket.IO Events

#### Client → Server
- `subscribe:device:infusion` - Subscribe to infusion confirmations
- `subscribe:device:progress` - Subscribe to progress updates
- `subscribe:device:status` - Subscribe to status updates
- `subscribe:device:errors` - Subscribe to error notifications

#### Server → Client
- `device:infusion:confirmed` - Device confirmed infusion start
- `device:progress:update` - Real-time progress updates
- `device:status:update` - Device status changes
- `device:error` - Device error notifications

### 2. Redis Caching
- **Infusion Confirmations**: `device:{deviceId}:infusion:confirmation` (10 min TTL)
- **Progress Data**: `device:{deviceId}:progress` (5 sec TTL)
- **Status Data**: `device:{deviceId}:status` (10 sec TTL)
- **Error Data**: `device:{deviceId}:error` (5 min TTL)

## Testing Components

### 1. HTML Test Interface (`infusion-flow-test.html`)
- **Purpose**: Complete frontend testing without React
- **Features**:
  - Configure device and infusion parameters
  - Send start infusion commands
  - Monitor Socket.IO connections
  - Simulate device responses
  - Real-time progress monitoring

### 2. MQTT Device Simulator (`mqtt-device-simulator.js`)
- **Purpose**: Simulate an infusion device
- **Features**:
  - Responds to MQTT commands
  - Sends infusion confirmations
  - Provides real-time progress updates
  - Interactive command interface
  - Error simulation capabilities

### 3. ESP32 Arduino Code (`esp32-infusion-simulator.ino`)
- **Purpose**: Hardware device simulation
- **Features**:
  - Complete ESP32 implementation
  - WiFi and MQTT connectivity
  - JSON command parsing
  - Real-time progress calculation
  - Hardware health monitoring

## Error Handling

### 1. Frontend
- **Timeout**: 30-second device response timeout
- **Retry**: Option to retry failed connections
- **User Feedback**: Clear error messages and status indicators

### 2. Backend
- **Validation**: Input validation for all endpoints
- **MQTT Errors**: Connection retry logic with exponential backoff
- **Socket.IO**: Automatic reconnection and subscription management

### 3. Device Communication
- **QoS Levels**: 
  - Commands and confirmations: QoS 1 (at least once)
  - Progress updates: QoS 0 (fire and forget)
- **Message Validation**: JSON schema validation
- **Health Monitoring**: Regular heartbeat messages

## Security Considerations

### 1. MQTT Security
- **TLS/SSL**: Encrypted connections (mqtts://)
- **Authentication**: Username/password authentication
- **Topic Security**: Device-specific topic restrictions

### 2. API Security
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Prevent API abuse
- **Authentication**: JWT-based authentication (implement as needed)

### 3. Real-time Communication
- **CORS**: Properly configured CORS policies
- **Socket Authentication**: Optional socket-level authentication
- **Message Validation**: All incoming messages validated

## Production Deployment

### 1. Environment Variables
```bash
# MQTT Configuration
HIVEMQ_HOST=your-production-cluster.hivemq.cloud
HIVEMQ_PORT=8883
HIVEMQ_USERNAME=production-username
HIVEMQ_PASSWORD=production-password

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Socket.IO Configuration
SOCKETIO_CORS_ORIGIN=https://your-frontend-domain.com
```

### 2. Monitoring
- **MQTT Connection Health**: Monitor broker connectivity
- **Socket.IO Metrics**: Track active connections and subscriptions
- **Device Health**: Monitor device heartbeats and response times
- **API Performance**: Track endpoint response times and error rates

### 3. Scaling Considerations
- **Redis Cluster**: For multiple backend instances
- **Socket.IO Adapter**: Redis adapter for horizontal scaling
- **Load Balancing**: Sticky sessions for Socket.IO connections

## Usage Example

### 1. Complete Flow Test
```bash
# 1. Start the backend server
npm start

# 2. Start the MQTT device simulator
cd tests
node mqtt-device-simulator.js

# 3. Open the test interface
open infusion-flow-test.html

# 4. Follow the test flow:
#    - Configure device parameters
#    - Connect to Socket.IO
#    - Subscribe to device events
#    - Start infusion
#    - Observe device confirmation
#    - Monitor real-time progress
```

### 2. Frontend Integration
```typescript
// In your React component
const [showWaitingModal, setShowWaitingModal] = useState(false);

const handleStartInfusion = () => {
  setShowWaitingModal(true);
  // Call your start infusion API
  startInfusionAPI(deviceId, infusionData);
};

const handleDeviceConfirmed = (confirmationData) => {
  setShowWaitingModal(false);
  // Proceed to device monitoring
  navigateToDeviceMonitoring(confirmationData.infusionId);
};

<WaitingForDeviceModal
  isOpen={showWaitingModal}
  onClose={() => setShowWaitingModal(false)}
  deviceId={deviceId}
  onDeviceConfirmed={handleDeviceConfirmed}
/>
```

This implementation provides a robust, real-time infusion monitoring system with proper device confirmation, error handling, and comprehensive testing capabilities.
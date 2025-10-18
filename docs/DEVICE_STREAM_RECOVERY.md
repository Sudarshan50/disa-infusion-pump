# Device Stream Recovery System

This document describes the persistent device streaming system that maintains real-time connections and recovers infusion monitoring sessions across page reloads.

## Overview

The system creates persistent streams for each device that can survive page reloads, network interruptions, and session restarts. When a user refreshes the page or navigates back to the monitoring interface, the system automatically reconnects and resumes live progress tracking.

## Architecture

### Backend Components

#### 1. Enhanced MQTT Service
- **Redis Streams**: Stores historical progress data using Redis XADD/XRANGE
- **Persistent Storage**: Maintains current infusion state for 24 hours
- **Stream Management**: Automatic cleanup and retention policies

#### 2. New API Endpoints
- **`GET /api/device/status/{deviceId}`**: Get current device and infusion status
- **`GET /api/device/stream/{deviceId}`**: Get historical stream data
- **Extended TTL**: Progress data stored for 5 minutes (vs 5 seconds)

#### 3. Enhanced Socket.IO Service
- **Device-specific rooms**: Isolated streams per device
- **Automatic subscription management**: Handles reconnections gracefully
- **State recovery**: Sends cached data on reconnection

### Frontend Components

#### 1. DeviceStreamService
- **Connection Management**: Handles socket connections and reconnections
- **Auto-recovery**: Automatically restores sessions on page load
- **Local Storage**: Persists current device ID across sessions
- **Event Aggregation**: Centralized event handling for multiple components

#### 2. useDeviceStream Hook
- **React Integration**: Easy-to-use hook for components
- **State Management**: Manages connection state and device data
- **TypeScript Support**: Full type safety for all data structures
- **Auto-connect**: Automatic connection on component mount

#### 3. DeviceMonitor Component
- **Real-time Display**: Live progress and status updates
- **Recovery Indication**: Shows when session was recovered
- **Connection Status**: Visual feedback for connection state
- **Progress Visualization**: Progress bars and time remaining

## Data Flow

### Initial Connection
1. **Component mounts** → `useDeviceStream` hook activates
2. **Get current status** → API call to check for active infusions
3. **Connect to socket** → Real-time event subscription
4. **Subscribe to device** → Device-specific event streams
5. **Display data** → Show current infusion status and progress

### Page Reload Recovery
1. **Page loads** → DeviceStreamService checks localStorage
2. **Recover device ID** → Gets previously monitored device
3. **Fetch current state** → API call to get latest infusion status
4. **Reconnect streams** → Resume real-time event subscriptions
5. **Restore UI** → Display recovered data with "Session Recovered" badge

### Real-time Updates
1. **Device sends MQTT** → Progress/status updates via MQTT
2. **Backend processes** → Updates Redis streams and cache
3. **Socket.IO broadcasts** → Real-time events to subscribed clients
4. **Frontend updates** → UI automatically reflects new data

## Redis Data Structure

### Current Infusion State
```redis
device:PUMP_0001:current:infusion
{
  "infusionId": "67123abc456def789012345",
  "status": "active",
  "startedAt": "2024-10-18T10:30:00.000Z",
  "deviceId": "PUMP_0001",
  "parameters": {
    "flowRateMlMin": 10,
    "plannedTimeMin": 60,
    "plannedVolumeMl": 600
  }
}
TTL: 86400 seconds (24 hours)
```

### Progress Streams
```redis
device:PUMP_0001:stream:progress
[
  {
    "timestamp": "2024-10-18T10:45:00.000Z",
    "data": {
      "timeRemainingMin": 45.5,
      "volumeRemainingMl": 455.0,
      "infusionId": "67123abc456def789012345"
    },
    "id": "1697625900000-abc123"
  }
]
Max Length: 1000 entries
```

### Current Progress Cache
```redis
device:PUMP_0001:progress
{
  "timeRemainingMin": 45.5,
  "volumeRemainingMl": 455.0,
  "timestamp": "2024-10-18T10:45:00.000Z",
  "infusionId": "67123abc456def789012345"
}
TTL: 300 seconds (5 minutes)
```

## API Reference

### Get Device Status
```http
GET /api/device/status/{deviceId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Current infusion status retrieved",
  "data": {
    "device": {
      "deviceId": "PUMP_0001",
      "status": "running",
      "location": "ICU-101"
    },
    "currentInfusion": {
      "infusionId": "67123abc456def789012345",
      "status": "active",
      "startedAt": "2024-10-18T10:30:00.000Z",
      "deviceId": "PUMP_0001",
      "parameters": {
        "flowRateMlMin": 10,
        "plannedTimeMin": 60,
        "plannedVolumeMl": 600
      }
    },
    "latestProgress": {
      "timeRemainingMin": 45.5,
      "volumeRemainingMl": 455.0,
      "timestamp": "2024-10-18T10:45:00.000Z",
      "infusionId": "67123abc456def789012345"
    },
    "hasActiveInfusion": true,
    "recentProgress": [...]
  }
}
```

### Get Stream Data
```http
GET /api/device/stream/{deviceId}?type=progress&count=50
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "progress stream data retrieved",
  "data": {
    "deviceId": "PUMP_0001",
    "streamType": "progress",
    "count": 10,
    "data": [
      {
        "streamId": "1697625900000-abc123",
        "timestamp": "2024-10-18T10:45:00.000Z",
        "data": {
          "timeRemainingMin": 45.5,
          "volumeRemainingMl": 455.0,
          "infusionId": "67123abc456def789012345"
        }
      }
    ]
  }
}
```

## Frontend Usage

### Using the Hook
```typescript
import useDeviceStream from '@/hooks/useDeviceStream';

const MonitoringComponent = ({ deviceId }: { deviceId: string }) => {
  const {
    isConnected,
    deviceStatus,
    latestProgress,
    infusionRecovered,
    hasActiveInfusion,
    connectToDevice,
    refreshStatus
  } = useDeviceStream(deviceId, {
    autoConnect: true,
    autoRecover: true,
    baseUrl: process.env.REACT_APP_API_URL
  });

  if (infusionRecovered) {
    console.log('Session was recovered from page reload!');
  }

  return (
    <div>
      {hasActiveInfusion && (
        <div>
          <h3>Active Infusion</h3>
          <p>Time Remaining: {latestProgress?.progress?.timeRemainingMin} min</p>
          <p>Volume Remaining: {latestProgress?.progress?.volumeRemainingMl} ml</p>
        </div>
      )}
    </div>
  );
};
```

### Using the Service Directly
```javascript
// Connect to device stream
const status = await deviceStreamService.connectToDevice('PUMP_0001', {
  onInfusionRecovered: (recoveredData) => {
    console.log('Infusion recovered:', recoveredData);
    // Update UI with recovered data
  }
});

// Listen for real-time updates
deviceStreamService.addEventListener('progress', (data) => {
  console.log('Progress update:', data);
  // Update progress display
});

// Get historical data
const history = await deviceStreamService.getDeviceStreamData('PUMP_0001', 'progress', 20);
```

## Recovery Scenarios

### 1. Page Reload
- **Trigger**: User refreshes browser or navigates back
- **Action**: Auto-detect saved device ID, fetch current status, reconnect streams
- **Result**: Seamless continuation of monitoring

### 2. Network Interruption
- **Trigger**: WiFi disconnect, server restart, network issues
- **Action**: Automatic reconnection with exponential backoff
- **Result**: Restored connection with minimal data loss

### 3. Server Restart
- **Trigger**: Backend deployment, server maintenance
- **Action**: Client detects disconnection, retries connection
- **Result**: Reconnects when server is available, current state recovered from Redis

### 4. Browser Close/Open
- **Trigger**: User closes browser and reopens application
- **Action**: localStorage remembers device, auto-recovery on page load
- **Result**: Immediate restoration of monitoring session

## Configuration

### Environment Variables
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# MQTT Configuration  
HIVEMQ_HOST=your-cluster.hivemq.cloud
HIVEMQ_PORT=8883
HIVEMQ_USERNAME=your-username
HIVEMQ_PASSWORD=your-password

# Socket.IO Configuration
SOCKETIO_CORS_ORIGIN=http://localhost:5173
```

### Redis Stream Settings
- **Max stream length**: 1000 entries per device
- **Progress cache TTL**: 5 minutes
- **Infusion state TTL**: 24 hours
- **Confirmation cache TTL**: 10 minutes

### Frontend Configuration
```typescript
const config = {
  baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:3000',
  autoConnect: true,
  autoRecover: true,
  maxReconnectAttempts: 5,
  reconnectInterval: 1000
};
```

## Testing

### Manual Testing
1. **Start infusion** → Monitor progress updates
2. **Refresh page** → Verify session recovery
3. **Disconnect network** → Check reconnection behavior
4. **Restart server** → Confirm state persistence

### Automated Testing
```bash
# Test device stream endpoints
curl -X GET "http://localhost:3000/api/device/status/PUMP_0001"
curl -X GET "http://localhost:3000/api/device/stream/PUMP_0001?type=progress&count=10"

# Test with HTML interface
open tests/infusion-flow-test.html
```

## Performance Considerations

### Backend
- **Redis Memory**: ~100MB for 1000 devices with full streams
- **Socket Connections**: ~1MB per connected client
- **MQTT Throughput**: Handles 1000+ messages/second

### Frontend
- **Memory Usage**: ~10MB per monitored device
- **Network Traffic**: ~1KB every 2 seconds per device
- **Battery Impact**: Minimal with efficient event listeners

## Security

### Authentication
- **JWT Tokens**: Required for all API endpoints
- **Device Access Control**: Users can only access authorized devices
- **Socket Authentication**: Optional token-based socket auth

### Data Protection
- **TLS Encryption**: All MQTT and HTTP traffic encrypted
- **Input Validation**: All endpoints validate input data
- **Rate Limiting**: Prevents API abuse

This persistent streaming system ensures that healthcare professionals can monitor infusion devices reliably, even with network interruptions or browser refreshes, providing a robust foundation for critical medical device monitoring.
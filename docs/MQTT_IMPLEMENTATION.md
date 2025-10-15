# MQTT Device Control System

This implementation provides a complete MQTT-based device control system for ESP32 infusion pumps using HiveMQ as the message broker.

## Architecture Overview

```
Frontend Dashboard (Vercel)
    ↓ HTTP API calls
Backend Server (Node.js)
    ↓ MQTT commands
HiveMQ Cloud Broker
    ↓ MQTT subscriptions
ESP32 Infusion Pumps
    ↑ MQTT telemetry/status
HiveMQ Cloud Broker
    ↑ MQTT subscriptions
Backend Server (Node.js)
    ↑ WebSocket/HTTP polling
Frontend Dashboard (Vercel)
```

## MQTT Topics Structure

### Command Topics (Backend → ESP32)

- `devices/{deviceId}/commands` - Control commands sent to devices

### Status Topics (ESP32 → Backend)

- `devices/{deviceId}/status` - Device health and status updates
- `devices/{deviceId}/telemetry` - Real-time infusion progress data
- `devices/{deviceId}/error` - Error messages and alerts
- `devices/{deviceId}/response` - Command acknowledgments

## API Endpoints

### Device Control

- `POST /api/devices/:deviceId/start` - Start infusion
- `POST /api/devices/:deviceId/stop` - Stop infusion
- `POST /api/devices/:deviceId/pause` - Pause infusion
- `POST /api/devices/:deviceId/resume` - Resume infusion
- `GET /api/devices/:deviceId/telemetry` - Get real-time telemetry
- `GET /api/devices/status/:deviceId` - Get device status

### Device Management

- `POST /api/devices/create` - Create new device
- `POST /api/devices/health` - Health check endpoint

## Message Formats

### Start Infusion Command

```json
{
  "command": "START_INFUSION",
  "payload": {
    "flowRateMlMin": 10.5,
    "plannedTimeMin": 120,
    "plannedVolumeMl": 1260,
    "bolus": {
      "enabled": false,
      "volumeMl": 0
    }
  },
  "timestamp": "2025-10-04T12:00:00.000Z",
  "commandId": "cmd_123456789"
}
```

### Device Telemetry Response

```json
{
  "deviceId": "PUMP_0001",
  "timestamp": 1728043200000,
  "flowRate": 10.5,
  "currentVolume": 315.0,
  "targetVolume": 1260.0,
  "progress": 25.0,
  "isRunning": true,
  "isPaused": false,
  "medication": "Saline",
  "priority": "normal",
  "pressure": 2.1,
  "temperature": 25.3,
  "batteryLevel": 85.0
}
```

### Device Status Response

```json
{
  "status": "running",
  "deviceId": "PUMP_0001",
  "timestamp": 1728043200000,
  "isRunning": true,
  "isPaused": false
}
```

## Environment Configuration

Add these variables to your `.env` file:

```bash
# HiveMQ MQTT Configuration
HIVEMQ_HOST=your-hivemq-cluster.s1.eu.hivemq.cloud
HIVEMQ_PORT=8883
HIVEMQ_USERNAME=your-hivemq-username
HIVEMQ_PASSWORD=your-hivemq-password
```

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install mqtt
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Update HiveMQ credentials

3. **Start the server:**

   ```bash
   npm run dev
   ```

4. **Test the API:**

   ```bash
   # Create a device
   curl -X POST http://localhost:3000/api/devices/create \
     -H "Content-Type: application/json" \
     -d '{"location": "ICU Room 101"}'

   # Start infusion
   curl -X POST http://localhost:3000/api/devices/PUMP_0001/start \
     -H "Content-Type: application/json" \
     -d '{
       "infusionParams": {
         "flowRateMlMin": 10.5,
         "plannedTimeMin": 120,
         "plannedVolumeMl": 1260,
         "bolus": {
           "enabled": false,
           "volumeMl": 0
         }
       }
     }'
   ```

## ESP32 Integration

The ESP32 devices should:

1. **Connect to HiveMQ** using the same credentials
2. **Subscribe to** `devices/{deviceId}/commands`
3. **Publish status to** `devices/{deviceId}/status`
4. **Publish telemetry to** `devices/{deviceId}/telemetry`
5. **Handle commands** and send acknowledgments

See `docs/ESP32_MQTT_Example.cpp` for a complete Arduino implementation example.

## Data Flow

1. **Dashboard** sends HTTP request to backend
2. **Backend** publishes MQTT command to HiveMQ
3. **ESP32** receives command and executes
4. **ESP32** publishes status/telemetry to HiveMQ
5. **Backend** receives and stores data in Redis/MongoDB
6. **Dashboard** polls/subscribes for real-time updates

## Error Handling

- MQTT connection failures are handled with automatic reconnection
- Device command failures generate error messages
- All telemetry and errors are stored for historical analysis
- Redis provides real-time caching for dashboard responsiveness

## Security Considerations

- Use TLS/SSL for MQTT connections (port 8883)
- Implement device authentication
- Validate all incoming MQTT messages
- Rate limiting for API endpoints
- Secure environment variable storage

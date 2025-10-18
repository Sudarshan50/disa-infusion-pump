# Infusion Confirmation Database Updates

## Overview

When a device confirms an infusion via MQTT, the system now automatically updates the database to reflect the new state. This ensures consistency between the device status and the database records.

## Database Updates

### Device Updates
When an infusion confirmation is received:

1. **Device Status** → Set to `"running"`
2. **Active Infusion** → Set to the confirmed infusion ID

```javascript
// Device update
await Device.findOneAndUpdate(
  { deviceId },
  { 
    status: 'running',
    activeInfusion: confirmationData.infusionId 
  },
  { new: true }
);
```

### Infusion Updates
The confirmed infusion is also updated:

1. **Infusion Status** → Set to `"running"`

```javascript
// Infusion update  
await Infusion.findByIdAndUpdate(
  confirmationData.infusionId,
  { status: 'running' },
  { new: true }
);
```

## Status Flow

### Device Status Flow
```
idle/degraded → running → completed/stopped
```

### Infusion Status Flow  
```
pending → running → completed/cancelled
```

## MQTT Message Format

The device should send a confirmation message to topic `devices/{deviceId}/infusion`:

```json
{
  "infusionId": "673f3f57b2b7c2d74c123456",
  "confirmed": true,
  "confirmedAt": "2025-10-18T12:00:00.000Z",
  "timestamp": "2025-10-18T12:00:00.000Z",
  "parameters": {
    "flowRateMlMin": 5.0,
    "plannedTimeMin": 120,
    "plannedVolumeMl": 600
  }
}
```

## Code Flow

1. **MQTT Service** receives confirmation message
2. **MQTT Service** validates the message
3. **Socket Service** `streamInfusionConfirmation()` is called
4. **Database Updates** are performed:
   - Device status → "running"
   - Device activeInfusion → infusion ID
   - Infusion status → "running"
5. **Socket.IO** broadcasts the confirmation to connected clients

## Testing

### Test Database Updates

```bash
# Check current state
node tests/test-db-verification.js device DEVICE-001
node tests/test-db-verification.js infusion 673f3f57b2b7c2d74c123456

# Send confirmation
node tests/test-confirmation-db-update.js

# Verify updates
node tests/test-db-verification.js check DEVICE-001 673f3f57b2b7c2d74c123456
```

### Expected Results

Before confirmation:
```
Device DEVICE-001: status="idle", activeInfusion=null
Infusion 673f...: status="pending"
```

After confirmation:
```
Device DEVICE-001: status="running", activeInfusion="673f..."  
Infusion 673f...: status="running"
```

## Error Handling

The system includes comprehensive error handling:

- **Database connection errors** are logged but don't crash the system
- **Invalid device IDs** are rejected
- **Missing infusion IDs** are logged as errors
- **Socket.IO streaming** continues even if database updates fail

## Logging

All database updates are logged with detailed information:

```
✅ Updated device DEVICE-001 status to 'running' with activeInfusion: 673f3f57b2b7c2d74c123456
✅ Updated infusion 673f3f57b2b7c2d74c123456 status to 'running'
```

## Schema Changes

### Infusion Model
Added `status` field to track infusion lifecycle:

```javascript
status: {
  type: String,
  enum: ["pending", "confirmed", "running", "completed", "cancelled"],
  default: "pending",
}
```

### Device Model
The `status` field already existed with support for "running":

```javascript
status: {
  type: String,
  enum: ["healthy", "issue", "running", "paused", "stopped", "degraded"],
  default: "degraded",
}
```

## Frontend Integration

The frontend will receive the confirmation via Socket.IO and can:

1. Update device status displays
2. Show active infusion details
3. Start real-time progress monitoring
4. Transition to monitoring UI

The confirmation event is broadcasted as:
```javascript
socket.emit("device:infusion:confirmed", {
  deviceId,
  confirmation: confirmationData
});
```
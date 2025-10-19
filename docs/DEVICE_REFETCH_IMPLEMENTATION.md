# Device Details Refetch Implementation

## Overview

The WaitingForDeviceModal now refetches device details when:

1. The modal closes (user cancels or clicks outside)
2. Device confirmation is received successfully

This ensures that the device dashboard always shows the most up-to-date information after the confirmation process.

## Implementation Details

### 1. WaitingForDeviceModal Changes

- Added optional `onRefetchDeviceDetails?: () => void` prop
- Calls refetch when modal closes (`handleCancel`)
- Calls refetch when device confirmation is received

### 2. WizardStep3 Changes

- Added `onRefetchDeviceDetails?: () => void` prop
- Passes the callback to WaitingForDeviceModal

### 3. StartInfusionWizard Changes

- Added `onRefetchDeviceDetails?: () => void` prop
- Passes the callback down to WizardStep3

### 4. DeviceDashboard Changes

- Extracted `fetchDeviceData` as a standalone `useCallback` function
- Passes `fetchDeviceData` to StartInfusionWizard as `onRefetchDeviceDetails`

## Flow

```
DeviceDashboard.fetchDeviceData
  ↓
StartInfusionWizard.onRefetchDeviceDetails
  ↓
WizardStep3.onRefetchDeviceDetails
  ↓
WaitingForDeviceModal.onRefetchDeviceDetails
  ↓
Called on modal close OR device confirmation
```

## Expected Behavior

### When User Cancels Modal

1. User starts infusion wizard
2. Gets to confirmation step
3. Modal shows "Waiting for device..."
4. User clicks "Cancel" or clicks outside modal
5. **Device details are refetched from API**
6. Dashboard shows updated device status

### When Device Confirms

1. User starts infusion wizard
2. Gets to confirmation step
3. Modal shows "Waiting for device..."
4. Device sends MQTT confirmation
5. **Device details are refetched from API**
6. Modal shows "Device confirmed!"
7. Modal closes and dashboard shows updated device status

## Testing

To test this functionality:

1. **Start an infusion** through the wizard
2. **Cancel the waiting modal** and verify device details refresh
3. **Complete the confirmation flow** and verify device details refresh

The device status should update from the backend database after confirmation:

- Device status → "running"
- Device activeInfusion → infusion ID

## Benefits

- **Real-time accuracy**: Device dashboard always reflects latest database state
- **Consistency**: UI stays in sync with backend after confirmation
- **Better UX**: Users see immediate updates without manual refresh
- **Error resilience**: If confirmation fails, canceling still refetches current state

## Backward Compatibility

The `onRefetchDeviceDetails` prop is optional, so existing components that don't provide it will continue to work without refetch functionality.

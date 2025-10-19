# Paused Status Handling Fix

## Issue

The paused device status was not being properly displayed in the top status chip. Paused devices were showing as "Running" in the status chip while only showing the pause indicator in the controls section.

## Root Cause

1. **DeviceStatus Type**: The `DeviceStatus` type didn't include "Paused" as a valid value
2. **Status Mapping**: In `fetchDeviceData`, paused devices were being mapped to "Running" status
3. **StatusChip Component**: Didn't have CSS styling for paused status
4. **CSS Classes**: Missing `status-paused` CSS class definition

## Changes Made

### 1. Updated DeviceStatus Type

```typescript
// client/src/data/dummyData.ts
export type DeviceStatus =
  | "Healthy"
  | "Running"
  | "Issue"
  | "Degraded"
  | "Paused";
```

### 2. Fixed Status Mapping

Updated all status mapping functions to properly handle paused status:

```typescript
status: realDeviceDetails.status === 'paused' ? 'Paused' : // Show paused as Paused
```

### 3. Enhanced StatusChip Component

```typescript
// client/src/components/StatusChip.tsx
case "Paused":
  return "status-paused";
```

### 4. Added CSS Styling

```css
/* client/src/index.css */
--status-paused: 43 74% 66%;

.status-paused {
  @apply bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400;
}
```

### 5. Updated UI Logic

- Running/Paused controls now check for both "Running" and "Paused" status
- Paused indicator uses `deviceState.status === "Paused"`
- Start infusion button excludes paused devices

## Expected Behavior

### When Device is Paused:

1. **Top Status Chip**: Shows "Paused" with yellow styling
2. **Controls Section**: Shows "⏸️ Infusion is currently paused" message
3. **Running Controls**: Resume/Stop actions are available
4. **Start Infusion**: Button is hidden (device already has active infusion)

### When Device is Running:

1. **Top Status Chip**: Shows "Running" with orange styling
2. **Controls Section**: Shows pause/stop actions
3. **No Pause Message**: Displayed

### When Device is Healthy:

1. **Top Status Chip**: Shows "Healthy" with green styling
2. **Start Infusion**: Button is available
3. **No Running Controls**: Displayed

## Visual Changes

**Before**: Paused device showed "Running" status chip with pause message
**After**: Paused device shows "Paused" status chip with pause message

## Testing

To test the paused status:

1. Start an infusion through the wizard
2. Wait for device confirmation
3. Pause the infusion using the pause button
4. Verify the status chip shows "Paused" with yellow styling
5. Verify the controls show the pause message
6. Verify resume/stop buttons are available

## CSS Color Scheme

- **Healthy**: Green (`--status-healthy: 146 71% 37%`)
- **Running**: Orange (`--status-running: 38 92% 50%`)
- **Paused**: Yellow (`--status-paused: 43 74% 66%`)
- **Issue**: Amber (`--status-issue: 32 95% 44%`)
- **Degraded**: Red (`--status-degraded: 0 84% 60%`)

This provides a clear visual hierarchy where paused is distinctly different from running while still indicating an active state.

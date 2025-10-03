import { useState } from "react";
import { Device } from "@/data/dummyData";
import { StatusChip } from "./StatusChip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Play, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunningDeviceActions } from "./RunningDeviceActions";
import { IdleDeviceActions } from "./IdleDeviceActions";

interface DeviceRowProps {
  device: Device;
  expanded: boolean;
  onToggleExpand: (deviceId: string) => void;
  onUpdateDevice: (deviceId: string, updates: Partial<Device>) => void;
}

export const DeviceRow = ({
  device,
  expanded,
  onToggleExpand,
  onUpdateDevice,
}: DeviceRowProps) => {
  return (
    <div className="border rounded-xl overflow-hidden transition-all hover:shadow-md bg-card">
      {/* Collapsed Row */}
      <button
        onClick={() => onToggleExpand(device.deviceId)}
        className="w-full p-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-4 md:gap-8 flex-1 min-w-0">
          <span className="font-mono font-semibold text-sm md:text-base whitespace-nowrap">
            {device.deviceId}
          </span>
          <StatusChip status={device.status} showPulse={device.status === "Running"} />
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t bg-muted/30 p-4 md:p-6 space-y-6 animate-accordion-down">
          <Card className="glass-dark">
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Device ID</p>
                <p className="font-mono font-semibold">{device.deviceId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Infusions Completed</p>
                <p className="font-semibold">{device.infusionsCompleted}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Status</p>
                <div className="mt-1">
                  <StatusChip status={device.status} showPulse={device.status === "Running"} />
                </div>
              </div>
            </div>
          </Card>

          {device.status === "Degraded" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-destructive/10 p-3 rounded-lg">
              <span className="text-destructive font-medium">Last online:</span>
              <span>{new Date(device.lastOnline).toLocaleString()}</span>
            </div>
          )}

          {/* Actions based on status */}
          {device.status === "Running" ? (
            <RunningDeviceActions device={device} onUpdateDevice={onUpdateDevice} />
          ) : (
            <IdleDeviceActions device={device} onUpdateDevice={onUpdateDevice} />
          )}
        </div>
      )}
    </div>
  );
};

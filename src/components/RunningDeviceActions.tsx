import { useState } from "react";
import { Device } from "@/data/dummyData";
import { Button } from "@/components/ui/button";
import { Pause, Play, Square, Eye } from "lucide-react";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { PatientDetailsModal } from "./PatientDetailsModal";

interface RunningDeviceActionsProps {
  device: Device;
  onUpdateDevice: (deviceId: string, updates: Partial<Device>) => void;
}

export const RunningDeviceActions = ({
  device,
  onUpdateDevice,
}: RunningDeviceActionsProps) => {
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const handlePauseResume = () => {
    const action = isPaused ? "resume" : "pause";
    console.log(`⏸️ ${action.toUpperCase()} Infusion Confirmed`, {
      deviceId: device.deviceId,
      action,
      timestamp: new Date().toISOString(),
    });
    setIsPaused(!isPaused);
    setPauseModalOpen(false);
  };

  const handleStop = () => {
    console.log("⏹️ STOP Infusion Confirmed", {
      deviceId: device.deviceId,
      action: "stop",
      timestamp: new Date().toISOString(),
    });
    onUpdateDevice(device.deviceId, { status: "Healthy", patient: undefined, infusion: undefined, progress: undefined });
    setStopModalOpen(false);
  };

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => setPauseModalOpen(true)}
          variant="outline"
          className="flex-1 min-w-[140px] h-12"
        >
          {isPaused ? (
            <>
              <Play className="mr-2 h-4 w-4" />
              Resume
            </>
          ) : (
            <>
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </>
          )}
        </Button>
        <Button
          onClick={() => setStopModalOpen(true)}
          variant="destructive"
          className="flex-1 min-w-[140px] h-12"
        >
          <Square className="mr-2 h-4 w-4" />
          Stop
        </Button>
        <Button
          onClick={() => {
            console.log("👁️ View Patient & Infusion Details", {
              deviceId: device.deviceId,
              timestamp: new Date().toISOString(),
            });
            setDetailsModalOpen(true);
          }}
          variant="secondary"
          className="flex-1 min-w-[140px] h-12"
        >
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </Button>
      </div>

      <ConfirmActionModal
        open={pauseModalOpen}
        onOpenChange={setPauseModalOpen}
        action={isPaused ? "resume" : "pause"}
        deviceId={device.deviceId}
        onConfirm={handlePauseResume}
      />

      <ConfirmActionModal
        open={stopModalOpen}
        onOpenChange={setStopModalOpen}
        action="stop"
        deviceId={device.deviceId}
        onConfirm={handleStop}
      />

      {device.patient && device.infusion && device.progress && (
        <PatientDetailsModal
          open={detailsModalOpen}
          onOpenChange={setDetailsModalOpen}
          device={device}
        />
      )}
    </>
  );
};

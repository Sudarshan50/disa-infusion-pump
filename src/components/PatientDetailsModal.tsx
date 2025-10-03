import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Device } from "@/data/dummyData";
import { User, Syringe, Clock, Droplet } from "lucide-react";

interface PatientDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: Device;
}

export const PatientDetailsModal = ({
  open,
  onOpenChange,
  device,
}: PatientDetailsModalProps) => {
  const [progressMode, setProgressMode] = useState<"time" | "volume">(
    device.progress?.mode || "time"
  );

  if (!device.patient || !device.infusion || !device.progress) {
    return null;
  }

  const getProgressValue = () => {
    if (progressMode === "time") {
      const remaining = device.progress!.timeRemainingMin;
      const total = device.infusion!.plannedTimeMin;
      return ((total - remaining) / total) * 100;
    } else {
      const remaining = device.progress!.volumeRemainingMl;
      const total = device.infusion!.plannedVolumeMl;
      return ((total - remaining) / total) * 100;
    }
  };

  const getRemainingValue = () => {
    if (progressMode === "time") {
      return `${device.progress!.timeRemainingMin} min`;
    } else {
      return `${device.progress!.volumeRemainingMl} ml`;
    }
  };

  const handleToggleMode = () => {
    const newMode = progressMode === "time" ? "volume" : "time";
    console.log("🔄 Toggle Progress Mode", {
      deviceId: device.deviceId,
      from: progressMode,
      to: newMode,
      timestamp: new Date().toISOString(),
    });
    setProgressMode(newMode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Patient & Infusion Details - {device.deviceId}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Patient Info */}
          <Card className="glass-dark">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <User className="h-5 w-5" />
                <h3>Patient Information</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-semibold">{device.patient.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Age</p>
                  <p className="font-semibold">{device.patient.age} years</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="font-semibold">{device.patient.weight} kg</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bed No.</p>
                  <p className="font-semibold">{device.patient.bedNo}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Drug Infused</p>
                  <p className="font-semibold">{device.patient.drugInfused}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Allergies</p>
                  <p className="font-semibold">{device.patient.allergies}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Infusion Details */}
          <Card className="glass-dark">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <Syringe className="h-5 w-5" />
                <h3>Infusion Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Flow Rate</p>
                  <p className="font-semibold">{device.infusion.flowRateMlMin} ml/min</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Planned Time</p>
                  <p className="font-semibold">{device.infusion.plannedTimeMin} min</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Planned Volume</p>
                  <p className="font-semibold">{device.infusion.plannedVolumeMl} ml</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bolus</p>
                  <p className="font-semibold">
                    {device.infusion.bolus.enabled
                      ? `Yes (${device.infusion.bolus.volumeMl} ml)`
                      : "No"}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Progress */}
          <Card className="glass-dark">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  {progressMode === "time" ? (
                    <Clock className="h-5 w-5" />
                  ) : (
                    <Droplet className="h-5 w-5" />
                  )}
                  <h3>
                    {progressMode === "time" ? "Time Remaining" : "Volume Remaining"}
                  </h3>
                </div>
                <Button variant="outline" size="sm" onClick={handleToggleMode}>
                  Switch to {progressMode === "time" ? "Volume" : "Time"}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold">{Math.round(getProgressValue())}%</span>
                </div>
                <Progress value={getProgressValue()} className="h-3" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-semibold text-primary">{getRemainingValue()}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

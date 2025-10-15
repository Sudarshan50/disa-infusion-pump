import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/StatusChip";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { RunningDeviceActions } from "@/components/RunningDeviceActions";
import { StartInfusionWizard } from "@/components/StartInfusionWizard";
import { ScheduleInfusionModal } from "@/components/ScheduleInfusionModal";
import { Progress } from "@/components/ui/progress";
import { DUMMY_DEVICE_STATE, DeviceState, Device } from "@/data/dummyData";
import { MapPin, Activity, Clock, Droplets } from "lucide-react";
import { Footer } from "@/components/Footer";

const DeviceDashboard = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    if (!deviceId) {
      navigate("/");
      return;
    }

    const device = DUMMY_DEVICE_STATE[deviceId];
    if (!device) {
      console.log("❌ Device Not Found", {
        type: "device_not_found",
        deviceId,
        at: new Date().toISOString(),
      });
      return;
    }

    setDeviceState(device);
  }, [deviceId, navigate]);

  const handleDeleteNotification = (id: string) => {
    if (!deviceState) return;
    setDeviceState({
      ...deviceState,
      notifications: deviceState.notifications.filter((n) => n.id !== id),
    });
  };

  const handleUpdateDevice = (deviceId: string, updates: Partial<Device>) => {
    if (!deviceState) return;
    setDeviceState({
      ...deviceState,
      ...updates,
    });
  };

  const handleToggleProgress = () => {
    if (!deviceState?.progress) return;
    const newMode = deviceState.progress.mode === "time" ? "volume" : "time";
    console.log("🔄 Toggle Progress Mode", {
      type: "progress_view_toggle",
      deviceId: deviceState.deviceId,
      from: deviceState.progress.mode,
      to: newMode,
      at: new Date().toISOString(),
    });
    setDeviceState({
      ...deviceState,
      progress: {
        ...deviceState.progress,
        mode: newMode,
      },
    });
  };

  if (!deviceState) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="glass max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Activity className="h-16 w-16 mx-auto text-muted-foreground" />
            <div>
              <h2 className="text-2xl font-bold">Device Not Found</h2>
              <p className="text-muted-foreground mt-2">
                The device {deviceId} could not be found.
              </p>
            </div>
            <Button onClick={() => navigate("/")}>Back to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const deviceAsDevice: Device = {
    deviceId: deviceState.deviceId,
    status: deviceState.status,
    infusionsCompleted: 0,
    lastOnline: new Date().toISOString(),
    patient: deviceState.patient,
    infusion: deviceState.infusion,
    progress: deviceState.progress,
  };

  const progressPercent =
    deviceState.progress?.mode === "time"
      ? deviceState.infusion
        ? ((deviceState.infusion.plannedTimeMin -
            deviceState.progress.timeRemainingMin) /
            deviceState.infusion.plannedTimeMin) *
          100
        : 0
      : deviceState.infusion
        ? ((deviceState.infusion.plannedVolumeMl -
            deviceState.progress.volumeRemainingMl) /
            deviceState.infusion.plannedVolumeMl) *
          100
        : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Device Info Card */}
      <Card className="glass">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl flex items-center gap-3">
                <Activity className="h-6 w-6 text-primary" />
                {deviceState.deviceId}
              </CardTitle>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{deviceState.location}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationsPopover
                notifications={deviceState.notifications}
                onDelete={handleDeleteNotification}
                deviceId={deviceState.deviceId}
              />
              <StatusChip status={deviceState.status} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Running State */}
      {deviceState.status === "Running" &&
        deviceState.patient &&
        deviceState.infusion && (
          <div className="space-y-6">
            {/* Controls - First */}
            <Card className="glass">
              <CardHeader>
                <CardTitle>Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <RunningDeviceActions
                  device={deviceAsDevice}
                  onUpdateDevice={handleUpdateDevice}
                />
              </CardContent>
            </Card>

            {/* Progress - Second */}
            {deviceState.progress && (
              <Card className="glass">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Progress</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleToggleProgress}
                    >
                      Switch to{" "}
                      {deviceState.progress.mode === "time" ? "Volume" : "Time"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {deviceState.progress.mode === "time" ? (
                        <>
                          <Clock className="h-5 w-5 text-primary" />
                          <span className="font-medium">Time Remaining</span>
                        </>
                      ) : (
                        <>
                          <Droplets className="h-5 w-5 text-primary" />
                          <span className="font-medium">Volume Remaining</span>
                        </>
                      )}
                    </div>
                    <span className="text-2xl font-bold text-primary">
                      {deviceState.progress.mode === "time"
                        ? `${deviceState.progress.timeRemainingMin} min`
                        : `${deviceState.progress.volumeRemainingMl} ml`}
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-3" />
                  <p className="text-sm text-muted-foreground text-center">
                    {progressPercent.toFixed(1)}% complete
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Patient & Infusion Details - Third */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="text-lg">Patient Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{deviceState.patient.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Age</p>
                      <p className="font-medium">
                        {deviceState.patient.age} years
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Weight</p>
                      <p className="font-medium">
                        {deviceState.patient.weight} kg
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Bed No.</p>
                      <p className="font-medium">{deviceState.patient.bedNo}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Drug</p>
                      <p className="font-medium">
                        {deviceState.patient.drugInfused || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Allergies</p>
                      <p className="font-medium">
                        {deviceState.patient.allergies || "None"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader>
                  <CardTitle className="text-lg">Infusion Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Flow Rate</p>
                      <p className="font-medium">
                        {deviceState.infusion.flowRateMlMin} ml/min
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Planned Time
                      </p>
                      <p className="font-medium">
                        {deviceState.infusion.plannedTimeMin} min
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Planned Volume
                      </p>
                      <p className="font-medium">
                        {deviceState.infusion.plannedVolumeMl} ml
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Bolus</p>
                      <p className="font-medium">
                        {deviceState.infusion.bolus.enabled
                          ? `${deviceState.infusion.bolus.volumeMl} ml`
                          : "Disabled"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

      {/* Healthy State */}
      {deviceState.status === "Healthy" && (
        <Card className="glass">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  console.log("🚀 Open Start Infusion Wizard", {
                    deviceId: deviceState.deviceId,
                    timestamp: new Date().toISOString(),
                  });
                  setWizardOpen(true);
                }}
                className="flex-1 min-w-[200px] h-12"
              >
                <Activity className="mr-2 h-4 w-4" />
                Start Infusion
              </Button>
              <Button
                onClick={() => {
                  console.log("📅 Open Schedule Infusion", {
                    deviceId: deviceState.deviceId,
                    timestamp: new Date().toISOString(),
                  });
                  setScheduleOpen(true);
                }}
                variant="outline"
                className="flex-1 min-w-[200px] h-12"
                disabled
              >
                <Clock className="mr-2 h-4 w-4" />
                Schedule Infusion
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other Status States */}
      {(deviceState.status === "Issue" ||
        deviceState.status === "Degraded") && (
        <Card className="glass border-destructive/50">
          <CardContent className="pt-6 text-center space-y-2">
            <p className="font-semibold text-destructive">
              Device requires attention
            </p>
            <p className="text-sm text-muted-foreground">
              Please contact maintenance or technical support
            </p>
          </CardContent>
        </Card>
      )}

      <StartInfusionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        device={deviceAsDevice}
        onUpdateDevice={handleUpdateDevice}
      />

      <ScheduleInfusionModal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        deviceId={deviceState.deviceId}
      />

      <Footer />
    </div>
  );
};

export default DeviceDashboard;

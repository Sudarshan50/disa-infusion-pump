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
import { MapPin, Activity, Clock, Droplets, Loader2 } from "lucide-react";
import { Footer } from "@/components/Footer";
import { deviceApi, DeviceDetails } from "@/lib/deviceApi";
import { useAuth } from "@/hooks/useAuth";

const DeviceDashboard = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deviceDetails, setDeviceDetails] = useState<DeviceDetails | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    const fetchDeviceData = async () => {
      if (!deviceId) {
        navigate("/");
        return;
      }

      // Check if user has access to this device
      if (user?.role === 'attendee' && user.deviceId !== deviceId) {
        setError("Access denied: You don't have permission to access this device");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Fetch real device details for the top ribbon
        const realDeviceDetails = await deviceApi.getDeviceDetails(deviceId);
        setDeviceDetails(realDeviceDetails);

        // Get dummy data for the rest of the functionality
        const dummyDevice = DUMMY_DEVICE_STATE[deviceId];
        if (!dummyDevice) {
          console.log("❌ Device Not Found in Dummy Data", {
            type: "device_not_found",
            deviceId,
            at: new Date().toISOString(),
          });
          // Use real device data to create basic state
          setDeviceState({
            deviceId: realDeviceDetails.deviceId,
            location: realDeviceDetails.location,
            status: realDeviceDetails.status === 'running' ? 'Running' : 
                   realDeviceDetails.status === 'healthy' ? 'Healthy' :
                   realDeviceDetails.status === 'issue' ? 'Issue' :
                   realDeviceDetails.status === 'degraded' ? 'Degraded' : 'Healthy',
            notifications: [],
            logs: [],
            patient: null,
            infusion: null,
            progress: null
          });
        } else {
          // Update dummy data with real device info
          setDeviceState({
            ...dummyDevice,
            deviceId: realDeviceDetails.deviceId,
            location: realDeviceDetails.location,
            status: realDeviceDetails.status === 'running' ? 'Running' : 
                   realDeviceDetails.status === 'healthy' ? 'Healthy' :
                   realDeviceDetails.status === 'issue' ? 'Issue' :
                   realDeviceDetails.status === 'degraded' ? 'Degraded' : 'Healthy',
            notifications: [] // Use real notifications from API
          });
        }

        console.log("✅ Device Data Loaded", {
          deviceId,
          status: realDeviceDetails.status,
          location: realDeviceDetails.location,
          timestamp: new Date().toISOString(),
        });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load device details';
        setError(errorMessage);
        console.log("❌ Device Data Load Failed", {
          deviceId,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeviceData();
  }, [deviceId, navigate, user]);

  const handleDeleteNotification = (id: string) => {
    if (!deviceState) return;
    setDeviceState({
      ...deviceState,
      notifications: deviceState.notifications.filter((n) => n.id !== id),
    });
  };

  const handleUpdateDevice = async (deviceId: string, updates: Partial<Device>) => {
    if (!deviceState || !deviceDetails) return;
    
    // Update local state immediately for UI responsiveness
    setDeviceState({
      ...deviceState,
      ...updates,
    });

    // Refresh device details from API to get real status
    try {
      const updatedDetails = await deviceApi.getDeviceDetails(deviceId);
      setDeviceDetails(updatedDetails);
      
      // Update device state with real status
      setDeviceState(prev => prev ? {
        ...prev,
        status: updatedDetails.status === 'running' ? 'Running' : 
               updatedDetails.status === 'healthy' ? 'Healthy' :
               updatedDetails.status === 'issue' ? 'Issue' :
               updatedDetails.status === 'degraded' ? 'Degraded' : 'Healthy',
      } : null);
    } catch (err) {
      console.error('Failed to refresh device details:', err);
    }
  };

  const handleDeviceAction = async (
    action: 'stop' | 'pause' | 'resume', 
    params?: { reason?: string; emergency?: boolean }
  ) => {
    if (!deviceId || !deviceDetails) return;

    try {
      setActionLoading(action);
      console.log(`🔄 Device Action: ${action}`, {
        deviceId,
        action,
        params,
        timestamp: new Date().toISOString(),
      });

      switch (action) {
        case 'stop':
          await deviceApi.stopInfusion(deviceId, params);
          break;
        case 'pause':
          await deviceApi.pauseInfusion(deviceId, params);
          break;
        case 'resume':
          await deviceApi.resumeInfusion(deviceId);
          break;
      }
      
      // Refresh device details after action
      const updatedDetails = await deviceApi.getDeviceDetails(deviceId);
      setDeviceDetails(updatedDetails);
      
      // Update device state with new status
      setDeviceState(prev => prev ? {
        ...prev,
        status: updatedDetails.status === 'running' ? 'Running' : 
               updatedDetails.status === 'healthy' ? 'Healthy' :
               updatedDetails.status === 'issue' ? 'Issue' :
               updatedDetails.status === 'degraded' ? 'Degraded' : 'Healthy',
      } : null);

      console.log(`✅ Device Action Success: ${action}`, {
        deviceId,
        newStatus: updatedDetails.status,
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} infusion`;
      console.error(`❌ Device Action Failed: ${action}`, {
        deviceId,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
      // TODO: Show error toast/notification to user
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartInfusion = async (params: {
    flowRateMlMin: number;
    plannedTimeMin: number;
    plannedVolumeMl: number;
    bolus?: { enabled: boolean; volumeMl: number };
  }) => {
    if (!deviceId || !deviceDetails) return;
    
    try {
      console.log("🚀 Starting Infusion", {
        deviceId,
        params,
        timestamp: new Date().toISOString(),
      });

      await deviceApi.startInfusion(deviceId, params);
      
      // Refresh device details after starting
      const updatedDetails = await deviceApi.getDeviceDetails(deviceId);
      setDeviceDetails(updatedDetails);
      
      // Update device state with new status and infusion details
      setDeviceState(prev => prev ? {
        ...prev,
        status: updatedDetails.status === 'running' ? 'Running' : 
               updatedDetails.status === 'healthy' ? 'Healthy' :
               updatedDetails.status === 'issue' ? 'Issue' :
               updatedDetails.status === 'degraded' ? 'Degraded' : 'Healthy',
        infusion: {
          flowRateMlMin: params.flowRateMlMin,
          plannedTimeMin: params.plannedTimeMin,
          plannedVolumeMl: params.plannedVolumeMl,
          bolus: params.bolus || { enabled: false, volumeMl: 0 }
        },
        // Add some mock progress for running infusions with simulated time passage
        progress: updatedDetails.status === 'running' ? {
          mode: "time" as const,
          timeRemainingMin: Math.max(0, params.plannedTimeMin - 0.5), // Simulate 0.5 min elapsed
          volumeRemainingMl: Math.max(0, params.plannedVolumeMl - (params.flowRateMlMin * 0.5)) // Simulate volume delivered
        } : null
      } : null);

      console.log("✅ Infusion Started Successfully", {
        deviceId,
        newStatus: updatedDetails.status,
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start infusion';
      console.error("❌ Infusion Start Failed", {
        deviceId,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
      // TODO: Show error toast/notification to user
    }
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading device details...</p>
        </div>
      </div>
    );
  }

  if (error || !deviceDetails || !deviceState) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="glass max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Activity className="h-16 w-16 mx-auto text-muted-foreground" />
            <div>
              <h2 className="text-2xl font-bold">Device Access Error</h2>
              <p className="text-muted-foreground mt-2">
                {error || `The device ${deviceId} could not be found.`}
              </p>
            </div>
            <Button onClick={() => navigate(user?.role === 'admin' ? '/admin' : '/')}>
              {user?.role === 'admin' ? 'Back to Admin' : 'Back to Login'}
            </Button>
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

  const progressPercent = (() => {
    if (!deviceState.progress || !deviceState.infusion) return 0;
    
    let percent = 0;
    if (deviceState.progress.mode === "time") {
      // Time-based progress: (elapsed time / total time) * 100
      const elapsedTime = deviceState.infusion.plannedTimeMin - deviceState.progress.timeRemainingMin;
      percent = deviceState.infusion.plannedTimeMin > 0 
        ? (elapsedTime / deviceState.infusion.plannedTimeMin) * 100 
        : 0;
      
      console.log("🔢 Time Progress Calculation", {
        plannedTime: deviceState.infusion.plannedTimeMin,
        timeRemaining: deviceState.progress.timeRemainingMin,
        elapsedTime,
        percent: percent.toFixed(1)
      });
    } else {
      // Volume-based progress: (delivered volume / total volume) * 100  
      const deliveredVolume = deviceState.infusion.plannedVolumeMl - deviceState.progress.volumeRemainingMl;
      percent = deviceState.infusion.plannedVolumeMl > 0 
        ? (deliveredVolume / deviceState.infusion.plannedVolumeMl) * 100 
        : 0;
      
      console.log("🔢 Volume Progress Calculation", {
        plannedVolume: deviceState.infusion.plannedVolumeMl,
        volumeRemaining: deviceState.progress.volumeRemainingMl,
        deliveredVolume,
        percent: percent.toFixed(1)
      });
    }
    
    // Ensure percentage is between 0 and 100
    return Math.max(0, Math.min(100, percent));
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Device Info Card - Using Real API Data */}
      <Card className="glass">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl flex items-center gap-3">
                <Activity className="h-6 w-6 text-primary" />
                {deviceDetails.deviceId}
              </CardTitle>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{deviceDetails.location}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Last updated: {new Date(deviceDetails.updatedAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationsPopover
                notifications={deviceState.notifications}
                onDelete={handleDeleteNotification}
                deviceId={deviceDetails.deviceId}
              />
              <StatusChip status={deviceState.status} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Running/Paused State */}
      {(deviceState.status === "Running" || deviceDetails?.status === "paused") &&
        deviceState.patient &&
        deviceState.infusion && (
          <div className="space-y-6">
            {/* Controls - First */}
            <Card className="glass">
              <CardHeader>
                <CardTitle>Controls</CardTitle>
                {deviceDetails?.status === "paused" && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg mt-2">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      ⏸️ Infusion is currently paused
                    </p>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <RunningDeviceActions
                  device={deviceAsDevice}
                  onUpdateDevice={handleUpdateDevice}
                  onDeviceAction={handleDeviceAction}
                  actionLoading={actionLoading}
                  isPaused={deviceDetails?.status === 'paused'}
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

      {/* Healthy/Stopped State - Can Start Infusion */}
      {(deviceState.status === "Healthy" || deviceDetails?.status === "stopped") && 
       deviceDetails?.status !== "paused" && (
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
        onStartInfusion={handleStartInfusion}
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

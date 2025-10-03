import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Device, Patient, Infusion } from "@/data/dummyData";
import { WizardStep1 } from "./wizard/WizardStep1";
import { WizardStep2 } from "./wizard/WizardStep2";
import { WizardStep3 } from "./wizard/WizardStep3";

interface StartInfusionWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: Device;
  onUpdateDevice: (deviceId: string, updates: Partial<Device>) => void;
}

export const StartInfusionWizard = ({
  open,
  onOpenChange,
  device,
  onUpdateDevice,
}: StartInfusionWizardProps) => {
  const [step, setStep] = useState(1);
  const [patientData, setPatientData] = useState<Partial<Patient>>({});
  const [infusionData, setInfusionData] = useState<Partial<Infusion>>({
    bolus: { enabled: false, volumeMl: 0 },
  });
  const [skippedPatient, setSkippedPatient] = useState(false);

  useEffect(() => {
    if (!open) {
      // Reset wizard when closed
      setStep(1);
      setPatientData({});
      setInfusionData({ bolus: { enabled: false, volumeMl: 0 } });
      setSkippedPatient(false);
    }
  }, [open]);

  const handleStep1Complete = (data: Partial<Patient>, skipped: boolean) => {
    console.log("📝 Wizard Step 1 Complete", {
      deviceId: device.deviceId,
      skipped,
      data,
      timestamp: new Date().toISOString(),
    });
    setPatientData(data);
    setSkippedPatient(skipped);
    setStep(2);
  };

  const handleStep2Complete = (data: Partial<Infusion>) => {
    console.log("📝 Wizard Step 2 Complete", {
      deviceId: device.deviceId,
      data,
      timestamp: new Date().toISOString(),
    });
    setInfusionData(data);
    setStep(3);
  };

  const handleStep3Confirm = () => {
    const payload = {
      deviceId: device.deviceId,
      patient: patientData,
      infusion: infusionData,
      skippedPatient,
      createdAt: new Date().toISOString(),
    };

    console.log("✅ START Infusion Confirmed - Complete Payload", payload);

    // Update device to Running status
    onUpdateDevice(device.deviceId, {
      status: "Running",
      patient: patientData as Patient,
      infusion: infusionData as Infusion,
      progress: {
        mode: "time",
        timeRemainingMin: infusionData.plannedTimeMin || 0,
        volumeRemainingMl: infusionData.plannedVolumeMl || 0,
      },
    });

    onOpenChange(false);
  };

  const getStepTitle = () => {
    switch (step) {
      case 1:
        return "Step 1: Patient Details";
      case 2:
        return "Step 2: Infusion Details";
      case 3:
        return "Step 3: Review & Confirm";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-primary/5 via-background to-secondary/10 p-4 sm:p-6 rounded-2xl border-0">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-2xl">
            Start Infusion - {device.deviceId}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 py-3 sm:py-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-1 sm:gap-2">
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-semibold transition-all text-sm sm:text-base ${
                  s === step
                    ? "bg-primary text-primary-foreground ring-2 sm:ring-4 ring-primary/20"
                    : s < step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`h-0.5 sm:h-1 w-4 sm:w-8 md:w-16 rounded-full transition-all ${
                    s < step ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold text-primary">{getStepTitle()}</h3>
        </div>

        {/* Step Content */}
        {step === 1 && <WizardStep1 onComplete={handleStep1Complete} />}
        {step === 2 && <WizardStep2 onComplete={handleStep2Complete} onBack={() => setStep(1)} />}
        {step === 3 && (
          <WizardStep3
            patientData={patientData}
            infusionData={infusionData}
            skippedPatient={skippedPatient}
            deviceId={device.deviceId}
            onConfirm={handleStep3Confirm}
            onBack={() => setStep(2)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

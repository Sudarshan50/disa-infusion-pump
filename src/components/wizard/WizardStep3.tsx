import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Patient, Infusion } from "@/data/dummyData";
import { User, Syringe, AlertCircle } from "lucide-react";

interface WizardStep3Props {
  patientData: Partial<Patient>;
  infusionData: Partial<Infusion>;
  skippedPatient: boolean;
  deviceId: string;
  onConfirm: () => void;
  onBack: () => void;
}

export const WizardStep3 = ({
  patientData,
  infusionData,
  skippedPatient,
  deviceId,
  onConfirm,
  onBack,
}: WizardStep3Props) => {
  const [confirmText, setConfirmText] = useState("");

  const isConfirmEnabled = confirmText.toLowerCase() === "start";

  return (
    <div className="space-y-6 py-4">
      {/* Patient Summary */}
      <Card className="glass-dark">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <User className="h-5 w-5" />
            <h3>Patient Information</h3>
            {skippedPatient && (
              <Badge variant="destructive" className="ml-auto">
                Skipped
              </Badge>
            )}
          </div>
          {!skippedPatient && patientData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-semibold">{patientData.name || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Age</p>
                <p className="font-semibold">{patientData.age || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Weight</p>
                <p className="font-semibold">{patientData.weight ? `${patientData.weight} kg` : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Bed No.</p>
                <p className="font-semibold">{patientData.bedNo || "—"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-muted-foreground">Drug</p>
                <p className="font-semibold">{patientData.drugInfused || "—"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-muted-foreground">Allergies</p>
                <p className="font-semibold">{patientData.allergies || "None specified"}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Patient details were skipped. Please ensure proper documentation.
            </p>
          )}
        </div>
      </Card>

      {/* Infusion Summary */}
      <Card className="glass-dark">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Syringe className="h-5 w-5" />
            <h3>Infusion Configuration</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Flow Rate</p>
              <p className="font-semibold">{infusionData.flowRateMlMin} ml/min</p>
            </div>
            <div>
              <p className="text-muted-foreground">Time</p>
              <p className="font-semibold">{infusionData.plannedTimeMin} min</p>
            </div>
            <div>
              <p className="text-muted-foreground">Volume</p>
              <p className="font-semibold">{infusionData.plannedVolumeMl} ml</p>
            </div>
          </div>
          {infusionData.bolus?.enabled && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">Bolus Configuration</p>
              <p className="font-semibold text-primary">
                Enabled - {infusionData.bolus.volumeMl} ml initial bolus
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Confirmation */}
      <Card className="glass-dark border-2 border-primary/20">
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <Label htmlFor="confirm-start" className="text-base font-semibold">
                Type <span className="font-mono text-primary">&quot;start&quot;</span> to confirm and begin infusion
              </Label>
              <Input
                id="confirm-start"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "start" here'
                className="h-12"
                autoFocus
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="flex gap-3 pt-4">
        <Button onClick={onBack} variant="outline" className="flex-1 h-12">
          Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!isConfirmEnabled}
          className="flex-1 h-12"
        >
          Confirm & Start Infusion
        </Button>
      </div>
    </div>
  );
};

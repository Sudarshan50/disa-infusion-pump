import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Patient } from "@/data/dummyData";
import { AlertCircle } from "lucide-react";

interface WizardStep1Props {
  onComplete: (data: Partial<Patient>, skipped: boolean) => void;
}

export const WizardStep1 = ({ onComplete }: WizardStep1Props) => {
  const [formData, setFormData] = useState<Partial<Patient>>({
    name: "",
    age: undefined,
    weight: undefined,
    bedNo: "",
    drugInfused: "",
    allergies: "",
  });

  const handleProceed = () => {
    onComplete(formData, false);
  };

  const handleSkip = () => {
    onComplete({}, true);
  };

  const isValidForProceed = formData.name && formData.weight && formData.bedNo;

  return (
    <div className="space-y-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="patient-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="patient-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Patient name"
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="patient-age">Age</Label>
          <Input
            id="patient-age"
            type="number"
            value={formData.age || ""}
            onChange={(e) =>
              setFormData({ ...formData, age: parseInt(e.target.value) || undefined })
            }
            placeholder="Years"
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="patient-weight">
            Weight (kg) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="patient-weight"
            type="number"
            value={formData.weight || ""}
            onChange={(e) =>
              setFormData({ ...formData, weight: parseInt(e.target.value) || undefined })
            }
            placeholder="Weight in kg"
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="patient-bed">
            Bed No. <span className="text-destructive">*</span>
          </Label>
          <Input
            id="patient-bed"
            value={formData.bedNo}
            onChange={(e) => setFormData({ ...formData, bedNo: e.target.value })}
            placeholder="e.g., ICU-12"
            className="h-12"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="patient-drug">Drug to be Infused</Label>
          <Input
            id="patient-drug"
            value={formData.drugInfused}
            onChange={(e) => setFormData({ ...formData, drugInfused: e.target.value })}
            placeholder="Drug name"
            className="h-12"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="patient-allergies">Allergies (optional)</Label>
          <Textarea
            id="patient-allergies"
            value={formData.allergies}
            onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
            placeholder="List any known allergies"
            className="min-h-20"
          />
        </div>
      </div>

      {!isValidForProceed && (
        <div className="flex items-start gap-2 bg-muted/50 p-4 rounded-lg text-sm">
          <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Please fill in required fields (Name, Weight, Bed No.) to proceed with validation,
            or skip to continue without validation.
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button
          onClick={handleProceed}
          disabled={!isValidForProceed}
          className="flex-1 h-12"
        >
          Proceed Next (Recommended)
        </Button>
        <Button onClick={handleSkip} variant="outline" className="flex-1 h-12">
          Skip (Not Recommended)
        </Button>
      </div>
    </div>
  );
};

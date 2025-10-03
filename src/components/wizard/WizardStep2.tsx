import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Infusion } from "@/data/dummyData";
import { AlertCircle, Calculator } from "lucide-react";

interface WizardStep2Props {
  onComplete: (data: Partial<Infusion>) => void;
  onBack: () => void;
}

export const WizardStep2 = ({ onComplete, onBack }: WizardStep2Props) => {
  const [flowRate, setFlowRate] = useState<number | undefined>();
  const [time, setTime] = useState<number | undefined>();
  const [volume, setVolume] = useState<number | undefined>();
  const [bolusEnabled, setBolusEnabled] = useState(false);
  const [bolusVolume, setBolusVolume] = useState(0);
  const [autoCalcMessage, setAutoCalcMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    // Auto-calculate the third value when two are provided
    const errors: string[] = [];
    setAutoCalcMessage("");

    // Validate flow rate
    if (flowRate !== undefined && flowRate > 10) {
      errors.push("Flow rate must not exceed 10 ml/min");
    }

    // Validate volume
    if (volume !== undefined && volume >= 30) {
      errors.push("Volume must be less than 30 ml");
    }

    setValidationErrors(errors);

    if (errors.length > 0) return;

    // Auto-calculate logic
    const values = [flowRate, time, volume].filter((v) => v !== undefined && v > 0);
    
    if (values.length === 2) {
      if (flowRate && time && !volume) {
        const calculated = flowRate * time;
        if (calculated < 30) {
          setVolume(calculated);
          setAutoCalcMessage(`Volume auto-calculated: ${calculated.toFixed(2)} ml = ${flowRate} ml/min × ${time} min`);
        }
      } else if (flowRate && volume && !time) {
        const calculated = volume / flowRate;
        setTime(calculated);
        setAutoCalcMessage(`Time auto-calculated: ${calculated.toFixed(2)} min = ${volume} ml ÷ ${flowRate} ml/min`);
      } else if (time && volume && !flowRate) {
        const calculated = volume / time;
        if (calculated <= 10) {
          setFlowRate(calculated);
          setAutoCalcMessage(`Flow rate auto-calculated: ${calculated.toFixed(2)} ml/min = ${volume} ml ÷ ${time} min`);
        }
      }
    }
  }, [flowRate, time, volume]);

  const handleProceed = () => {
    if (!flowRate || !time || !volume || validationErrors.length > 0) return;

    const infusionData: Partial<Infusion> = {
      flowRateMlMin: flowRate,
      plannedTimeMin: time,
      plannedVolumeMl: volume,
      bolus: {
        enabled: bolusEnabled,
        volumeMl: bolusEnabled ? bolusVolume : 0,
      },
    };

    onComplete(infusionData);
  };

  const isValid = flowRate && time && volume && validationErrors.length === 0;

  return (
    <div className="space-y-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="flow-rate">
            Flow Rate (ml/min) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="flow-rate"
            type="number"
            step="0.1"
            max="10"
            value={flowRate || ""}
            onChange={(e) => setFlowRate(parseFloat(e.target.value) || undefined)}
            placeholder="Max 10"
            className="h-12"
          />
          <p className="text-xs text-muted-foreground">Maximum: 10 ml/min</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="time">
            Time (min) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="time"
            type="number"
            step="1"
            value={time || ""}
            onChange={(e) => setTime(parseFloat(e.target.value) || undefined)}
            placeholder="Minutes"
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="volume">
            Volume (ml) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="volume"
            type="number"
            step="0.1"
            value={volume || ""}
            onChange={(e) => setVolume(parseFloat(e.target.value) || undefined)}
            placeholder="< 30 ml"
            className="h-12"
          />
          <p className="text-xs text-muted-foreground">Must be less than 30 ml</p>
        </div>
      </div>

      {autoCalcMessage && (
        <div className="flex items-start gap-2 bg-primary/10 p-4 rounded-lg text-sm">
          <Calculator className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-primary font-medium">{autoCalcMessage}</p>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="flex items-start gap-2 bg-destructive/10 p-4 rounded-lg text-sm">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            {validationErrors.map((error, index) => (
              <p key={index} className="text-destructive">{error}</p>
            ))}
          </div>
        </div>
      )}

      {/* Bolus Section */}
      <div className="space-y-4 p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <Label htmlFor="bolus-enabled" className="text-base font-semibold">
            Enable Bolus
          </Label>
          <Switch
            id="bolus-enabled"
            checked={bolusEnabled}
            onCheckedChange={setBolusEnabled}
          />
        </div>

        {bolusEnabled && volume && (
          <div className="space-y-3 pt-2">
            <Label>Bolus Volume: {bolusVolume.toFixed(1)} ml</Label>
            <Slider
              value={[bolusVolume]}
              onValueChange={(values) => setBolusVolume(values[0])}
              max={volume}
              step={0.5}
              className="py-4"
            />
            <p className="text-xs text-muted-foreground">
              Bolus will deliver the initial portion at a higher rate for faster onset
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <Button onClick={onBack} variant="outline" className="flex-1 h-12">
          Back
        </Button>
        <Button onClick={handleProceed} disabled={!isValid} className="flex-1 h-12">
          Proceed Next
        </Button>
      </div>
    </div>
  );
};

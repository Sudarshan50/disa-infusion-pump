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
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (isCalculating) return; // Prevent infinite loops during auto-calculation
    
    // Clear previous messages and errors
    const errors: string[] = [];
    setAutoCalcMessage("");

    // Validate flow rate
    if (flowRate !== undefined && flowRate > 10) {
      errors.push("Flow rate must not exceed 10 ml/min");
    }
    if (flowRate !== undefined && flowRate <= 0) {
      errors.push("Flow rate must be greater than 0");
    }

    // Validate time
    if (time !== undefined && time <= 0) {
      errors.push("Time must be greater than 0");
    }

    // Validate volume
    if (volume !== undefined && volume >= 30) {
      errors.push("Volume must be less than 30 ml");
    }
    if (volume !== undefined && volume <= 0) {
      errors.push("Volume must be greater than 0");
    }

    setValidationErrors(errors);

    if (errors.length > 0) return;

    // Count how many fields have valid values
    const hasFlowRate = flowRate !== undefined && flowRate > 0;
    const hasTime = time !== undefined && time > 0;
    const hasVolume = volume !== undefined && volume > 0;
    const filledFields = [hasFlowRate, hasTime, hasVolume].filter(Boolean).length;

    // Auto-calculate when exactly 2 fields are filled
    if (filledFields === 2) {
      setIsCalculating(true);
      
      if (hasFlowRate && hasTime && !hasVolume) {
        // Calculate Volume = Flow Rate × Time
        const calculated = Math.round((flowRate! * time!) * 100) / 100; // Round to 2 decimal places
        if (calculated < 30) {
          setVolume(calculated);
          setAutoCalcMessage(`Volume auto-calculated: ${calculated} ml = ${flowRate} ml/min × ${time} min`);
        } else {
          setAutoCalcMessage(`Calculated volume (${calculated} ml) exceeds 30 ml limit. Please adjust flow rate or time.`);
        }
      } else if (hasFlowRate && hasVolume && !hasTime) {
        // Calculate Time = Volume ÷ Flow Rate
        const calculated = Math.round((volume! / flowRate!) * 100) / 100; // Round to 2 decimal places
        setTime(calculated);
        setAutoCalcMessage(`Time auto-calculated: ${calculated} min = ${volume} ml ÷ ${flowRate} ml/min`);
      } else if (hasTime && hasVolume && !hasFlowRate) {
        // Calculate Flow Rate = Volume ÷ Time
        const calculated = Math.round((volume! / time!) * 100) / 100; // Round to 2 decimal places
        if (calculated <= 10) {
          setFlowRate(calculated);
          setAutoCalcMessage(`Flow rate auto-calculated: ${calculated} ml/min = ${volume} ml ÷ ${time} min`);
        } else {
          setAutoCalcMessage(`Calculated flow rate (${calculated} ml/min) exceeds 10 ml/min limit. Please adjust volume or time.`);
        }
      }
      
      setTimeout(() => setIsCalculating(false), 100); // Reset after a short delay
    }
  }, [flowRate, time, volume, isCalculating]);

  const handleClearAll = () => {
    setFlowRate(undefined);
    setTime(undefined);
    setVolume(undefined);
    setBolusEnabled(false);
    setBolusVolume(0);
    setAutoCalcMessage("");
    setValidationErrors([]);
  };

  const handleFlowRateChange = (value: string) => {
    const numValue = parseFloat(value) || undefined;
    setFlowRate(numValue);
  };

  const handleTimeChange = (value: string) => {
    const numValue = parseFloat(value) || undefined;
    setTime(numValue);
  };

  const handleVolumeChange = (value: string) => {
    const numValue = parseFloat(value) || undefined;
    setVolume(numValue);
  };

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

  const isValid = flowRate && flowRate > 0 && time && time > 0 && volume && volume > 0 && validationErrors.length === 0;

  return (
    <div className="space-y-4 sm:space-y-6 py-3 sm:py-4">
      {/* Info box about auto-calculation */}
      <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/20 p-3 sm:p-4 rounded-lg text-xs sm:text-sm border border-blue-200 dark:border-blue-800">
        <Calculator className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-blue-800 dark:text-blue-200">
            <strong>Auto-calculation:</strong> Fill any 2 fields and the third will be calculated automatically using the formula: Volume = Flow Rate × Time
          </p>
        </div>
        <Button 
          onClick={handleClearAll}
          variant="outline" 
          size="sm"
          className="ml-2 h-6 px-2 text-xs border-blue-300 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900"
        >
          Clear All
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="flow-rate" className="text-sm sm:text-base">
            Flow Rate (ml/min) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="flow-rate"
            type="number"
            step="0.1"
            min="0.1"
            max="10"
            value={flowRate || ""}
            onChange={(e) => handleFlowRateChange(e.target.value)}
            placeholder="Max 10"
            className="h-10 sm:h-12 text-sm sm:text-base"
          />
          <p className="text-xs text-muted-foreground">Maximum: 10 ml/min</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="time" className="text-sm sm:text-base">
            Time (min) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="time"
            type="number"
            step="0.1"
            min="0.1"
            value={time || ""}
            onChange={(e) => handleTimeChange(e.target.value)}
            placeholder="Minutes"
            className="h-10 sm:h-12 text-sm sm:text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="volume" className="text-sm sm:text-base">
            Volume (ml) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="volume"
            type="number"
            step="0.1"
            min="0.1"
            max="29.9"
            value={volume || ""}
            onChange={(e) => handleVolumeChange(e.target.value)}
            placeholder="< 30 ml"
            className="h-10 sm:h-12 text-sm sm:text-base"
          />
          <p className="text-xs text-muted-foreground">Must be less than 30 ml</p>
        </div>
      </div>

      {autoCalcMessage && (
        <div className="flex items-start gap-2 bg-primary/10 p-3 sm:p-4 rounded-lg text-xs sm:text-sm">
          <Calculator className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-primary font-medium">{autoCalcMessage}</p>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="flex items-start gap-2 bg-destructive/10 p-3 sm:p-4 rounded-lg text-xs sm:text-sm">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            {validationErrors.map((error, index) => (
              <p key={index} className="text-destructive">{error}</p>
            ))}
          </div>
        </div>
      )}

      {/* Bolus Section */}
      <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <Label htmlFor="bolus-enabled" className="text-sm sm:text-base font-semibold">
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
            <Label className="text-sm sm:text-base">Bolus Volume: {bolusVolume.toFixed(1)} ml</Label>
            <Slider
              value={[bolusVolume]}
              onValueChange={(values) => setBolusVolume(values[0])}
              max={volume}
              step={0.5}
              className="py-3 sm:py-4"
            />
            <p className="text-xs text-muted-foreground">
              Bolus will deliver the initial portion at a higher rate for faster onset
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-4">
        <Button onClick={onBack} variant="outline" className="flex-1 h-10 sm:h-12 text-sm sm:text-base">
          Back
        </Button>
        <Button onClick={handleProceed} disabled={!isValid} className="flex-1 h-10 sm:h-12 text-sm sm:text-base">
          Proceed Next
        </Button>
      </div>
    </div>
  );
};

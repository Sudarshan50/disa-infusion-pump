import mongoose from "mongoose";
const { Schema } = mongoose;

const PatientSubSchema = new Schema(
  {
    name: String,
    age: Number,
    weight: Number,
    bedNo: String,
    drugInfused: String,
    allergies: String,
  },
  { _id: false }
);

const InfusionDetailSchema = new Schema(
  {
    flowRateMlMin: Number,
    plannedTimeMin: Number,
    plannedVolumeMl: Number,
    bolus: {
      enabled: { type: Boolean, default: false },
      volumeMl: Number,
    },
  },
  { _id: false }
);

const InfusionSchema = new Schema(
  {
    infusionId: {
      type: String,
      required: true,
      unique: true,
      default: function () {
        return new mongoose.Types.ObjectId().toHexString();
      },
    },
    device: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    patientDetailSkipped: { type: Boolean, default: false },
    attendee: { type: Schema.Types.ObjectId, ref: "User" },
    ts: { type: Date, default: Date.now },
    patient: PatientSubSchema,
    infusion_detail: InfusionDetailSchema,
  },
  { timestamps: true }
);

const Infusion = mongoose.model("Infusion", InfusionSchema);

export default Infusion;

import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Device
 * - deviceId (human identifier, unique)
 * - location
 * - activeInfusion -> ref Infusion (current/active infusion)
 * - notifications -> array of Notification refs
 * - logs -> array of Log refs
 *
 * Keep notifications/logs as references (separate collections) for scalability.
 */
const DeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    location: { type: String, required: true },
    status: {
      type: String,
      enum: ["healthy", "issue", "running", "paused", "stopped", "degraded"],
      default: "degraded",
    },
    activeInfusion: { type: Schema.Types.ObjectId, ref: "Infusion" },
    notifications: [{ type: Schema.Types.ObjectId, ref: "Notification" }],
    logs: [{ type: Schema.Types.ObjectId, ref: "Log" }],
  },
  { timestamps: true }
);

/* (Optional) Helper: cascade-delete notifications/logs/infusions when a device is removed.
     Uncomment & adjust if you want automatic cleanup.
*/
// DeviceSchema.pre("deleteOne", { document: true, query: false }, async function (next) {
//   const deviceId = this._id;
//   await mongoose.model("Notification").deleteMany({ device: deviceId });
//   await mongoose.model("Log").deleteMany({ device: deviceId });
//   await mongoose.model("Infusion").deleteMany({ device: deviceId });
//   next();
// });

const Device = mongoose.model("Device", DeviceSchema);

export default Device;

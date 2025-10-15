import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Log
 * - device -> ref Device
 * - action (start/pause/resume/stop/...)
 * - actor -> ref User (who performed the action)
 * - result (free text / result code)
 */
const LogSchema = new Schema(
  {
    ts: { type: Date, default: Date.now },
    device: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    action: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    result: { type: String },
  },
  { timestamps: false }
);

const Log = mongoose.model("Log", LogSchema);

export default Log;

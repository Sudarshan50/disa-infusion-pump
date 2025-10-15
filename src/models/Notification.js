import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Notification
 * - device -> ref Device
 * - smallText (short notification message)
 */
const NotificationSchema = new Schema(
  {
    device: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    smallText: { type: String, required: true },
    ts: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const Notification = mongoose.model("Notification", NotificationSchema);

export default Notification;

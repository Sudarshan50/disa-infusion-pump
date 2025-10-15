import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * User (Admin / Attendee)
 * - name, email, role, lastLogin
 */
const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ["admin", "attendee"], required: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);

export default User;

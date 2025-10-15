import { BadRequestError, ForbiddenError } from "../lib/customErrors.js";
import { successResponse } from "../lib/responseUtils.js";
import { asyncErrorHandler } from "../middleware/errorHandler.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Device from "../models/Device.js";

let auth = {};

auth.createUser = asyncErrorHandler(async (req, res) => {
  const { name, passWord, email, role } = req.body;
  const error = [];
  if (!name) {
    error.push("Name is required");
  }
  if (!passWord) {
    error.push("Password is required");
  }
  if (!email) {
    error.push("Email is required");
  }
  if (!role || (role != "admin" && role != "attendee")) {
    error.push("Role is required");
  }
  if (error.length > 0) {
    throw new BadRequestError(error.join(", "));
  }
  const checkUser = await User.findOne({
    email: email,
  });
  if (checkUser) {
    throw new Error("User already exists with this email");
  }
  const hash = await bcrypt.hash(passWord, 10);
  const user = new User({
    name,
    passwordHash: hash,
    email,
    role,
  });
  await user.save();
  successResponse(res, { user }, "User created successfully", 201);
});

auth.login = asyncErrorHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;
  const error = [];
  if (!password) {
    error.push("Password is required");
  }
  if (!email) {
    error.push("Email is required");
  }
  if (error.length > 0) {
    throw new BadRequestError(error.join(", "));
  }
  const user = await User.findOne({ email: email });
  if (!user) {
    throw new ForbiddenError("Invalid email or password");
  }
  if (user.role === "attendee" && !deviceId) {
    throw new BadRequestError("Device ID is required for attendee login");
  }
  const deviceCheck = await Device.findOne({ deviceId: deviceId });
  if (user.role === "attendee" && !deviceCheck) {
    throw new ForbiddenError("Invalid Device ID");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new ForbiddenError("Invalid email or password");
  }

  const indiaTime = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
  });
  await User.findByIdAndUpdate(user._id, { lastLogin: new Date(indiaTime) });

  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    ...(user.role === "attendee" && { deviceId: deviceId }),
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });

  return successResponse(res, { token }, "Login successful", 200);
});

auth.updateUser = asyncErrorHandler(async (req, res) => {
  const {name,email} = req.body;
  const userId = req.user.id;

  const checkUser = await User.findById(userId);
  if (!checkUser) {
    throw new ForbiddenError("User not found");
  }
  if(email){
    const emailExists = await User.findOne({email:email});
    if(emailExists && emailExists._id.toString() !== userId){
      throw new BadRequestError("Email already in use");
    }
  }
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: { name:name || checkUser.name, email:email || checkUser.email } },
    { new: true }
  );
  successResponse(res, { user: updatedUser }, "User updated successfully", 200);
});

export default auth;

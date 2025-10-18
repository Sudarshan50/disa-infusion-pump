import { json } from "express";
import mongoose from "mongoose";
import { BadRequestError, ForbiddenError } from "../lib/customErrors.js";
import { redisClient } from "../lib/redis.js";
import { successResponse } from "../lib/responseUtils.js";
import { asyncErrorHandler } from "../middleware/errorHandler.js";
import Device from "../models/Device.js";
import mqttService from "../lib/mqtt.js";
import Infusion from "../models/Infusion.js";

let device = {};

device.create = asyncErrorHandler(async (req, res) => {
  const { location } = req.body;
  if (!location) {
    throw new BadRequestError("Location is required");
  }
  const getDeviceCount = await Device.countDocuments();
  const deviceId = `PUMP_${String(getDeviceCount + 1).padStart(4, "0")}`;
  const newDevice = new Device({
    deviceId,
    location,
  });
  await newDevice.save();
  successResponse(
    res,
    { device: newDevice },
    "Device created successfully",
    201
  );
});

device.createHealthCheck = asyncErrorHandler(async (req, res) => {
  const { deviceId, status } = req.body;
  if (!deviceId) {
    throw new BadRequestError("Device ID is required");
  }
  if (
    !status ||
    !["healthy", "issue", "running", "paused", "stopped", "degraded"].includes(
      status
    )
  ) {
    throw new BadRequestError("Valid status is required");
  }
  const check = await redisClient.get(`device:${deviceId}:status`);
  if (!check) {
    await Device.updateOne({ deviceId }, { status: "healthy" });
  }
  const indiaTime = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
  });
  await redisClient.set(
    `device:${deviceId}:status`,
    JSON.stringify({ status: status, lastPing: indiaTime }),
    { EX: 10 }
  );
  successResponse(res, null, "Health check received", 200);
});

device.start = asyncErrorHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { flowRateMlMin, plannedTimeMin, plannedVolumeMl, bolus, patient } = req.body;

  if (!deviceId) {
    throw new BadRequestError("Device ID is required");
  }

  if (!flowRateMlMin || !plannedTimeMin || !plannedVolumeMl) {
    throw new BadRequestError(
      "flowRateMlMin, plannedTimeMin, and plannedVolumeMl are required"
    );
  }

  // Fix: Use findOne instead of find to get a single document
  const deviceCheck = await Device.findOne({ deviceId });
  if (!deviceCheck) {
    throw new ForbiddenError("Invalid Device ID");
  } else if (deviceCheck.status === "running") {
    throw new ForbiddenError("Device is already running an infusion");
  }else if (deviceCheck.status === "degraded") {
    throw new ForbiddenError("Device is offline");
  }
  try {
    //create a infusion record...
    let infusionRecord;
    if(patient)
    {
      const newInfusion = new Infusion({
        device: deviceCheck._id,
        patient: patient,
        infusion_detail: {
          flowRateMlMin,
          plannedTimeMin,
          plannedVolumeMl,
          bolus: {
            enabled: bolus?.enabled || false,
            volumeMl: bolus?.volumeMl || 0,
          },
        },
      });
      infusionRecord = await newInfusion.save();
      console.log("Created infusion with _id:", infusionRecord._id.toString());
    }
    else
    {
      const newInfusion = new Infusion({
        device: deviceCheck._id,
        patientDetailSkipped: true,
        infusion_detail: {
          flowRateMlMin,
          plannedTimeMin,
          plannedVolumeMl,
          bolus: {
            enabled: bolus?.enabled || false,
            volumeMl: bolus?.volumeMl || 0,
          },
        },
      });
      infusionRecord = await newInfusion.save();
      console.log("Created infusion (no patient) with _id:", infusionRecord._id.toString());
    }
    if(!infusionRecord)
    {
      throw new Error("Failed to create infusion record");
    }
    
    // Publish start command to device via MQTT
    mqttService.publishCommand(deviceId, "START_INFUSION", {
      flowRateMlMin,
      plannedTimeMin,
      plannedVolumeMl,
      bolus: {
        enabled: bolus?.enabled || false,
        volumeMl: bolus?.volumeMl || 0,
      },
      infusionId: infusionRecord._id.toString(),  // Use MongoDB _id
    });

    // await Device.updateOne({ deviceId }, { status: "running" });

    successResponse(
      res,
      {
        deviceId,
        command: "START_INFUSION",
        status: "sent",
        infusionId: infusionRecord._id.toString(),
        parameters: { flowRateMlMin, plannedTimeMin, plannedVolumeMl, bolus },
      },
      "Start command sent to device successfully",
      200
    );
  } catch (error) {
    console.error("Error sending start command:", error);
    throw new Error("Failed to send start command to device");
  }
});

device.stop = asyncErrorHandler(async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    throw new BadRequestError("Device ID is required");
  }

  const deviceCheck = await Device.findOne({ deviceId });
  if (!deviceCheck) {
    throw new ForbiddenError("Invalid Device ID");
  } else if (deviceCheck.status !== "running") {
    throw new ForbiddenError("Device is not in running state");
  }

  try {
    // Publish stop command to device via MQTT
    mqttService.publishCommand(deviceId, "STOP_INFUSION", {
      reason: req.body.reason || "manual_stop",
      emergency: req.body.emergency || false,
    });

    // Update device status
    await Device.updateOne({ deviceId }, { status: "stopped", activeInfusion: null });

    successResponse(
      res,
      {
        deviceId,
        command: "STOP_INFUSION",
        status: "sent",
      },
      "Stop command sent to device successfully",
      200
    );
  } catch (error) {
    console.error("Error sending stop command:", error);
    throw new Error("Failed to send stop command to device");
  }
});

device.pause = asyncErrorHandler(async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    throw new BadRequestError("Device ID is required");
  }

  const deviceCheck = await Device.findOne({ deviceId });
  if (!deviceCheck) {
    throw new ForbiddenError("Invalid Device ID");
  } else if (deviceCheck.status !== "running") {
    throw new ForbiddenError("Device is not in running state");
  }

  try {
    mqttService.publishCommand(deviceId, "PAUSE_INFUSION", {
      reason: req.body.reason || "manual_pause",
    });

    await Device.updateOne({ deviceId }, { status: "paused" });

    successResponse(
      res,
      {
        deviceId,
        command: "PAUSE_INFUSION",
        status: "sent",
      },
      "Pause command sent to device successfully",
      200
    );
  } catch (error) {
    console.error("Error sending pause command:", error);
    throw new Error("Failed to send pause command to device");
  }
});

device.resume = asyncErrorHandler(async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    throw new BadRequestError("Device ID is required");
  }

  const deviceCheck = await Device.findOne({ deviceId });
  if (!deviceCheck) {
    throw new ForbiddenError("Invalid Device ID");
  } else if (deviceCheck.status !== "paused") {
    throw new ForbiddenError("Device is not in paused state");
  }

  try {
    mqttService.publishCommand(deviceId, "RESUME_INFUSION");

    await Device.updateOne({ deviceId }, { status: "running" });
    successResponse(
      res,
      {
        deviceId,
        command: "RESUME_INFUSION",
        status: "sent",
      },
      "Resume command sent to device successfully",
      200
    );
  } catch (error) {
    console.error("Error sending resume command:", error);
    throw new Error("Failed to send resume command to device");
  }
});


device.getDetailsById = asyncErrorHandler(async (req, res) => {
  const { deviceId } = req.params;
  if (!deviceId) {
    throw new BadRequestError("Device ID is required");
  }
  const deviceDetails = await Device.findOne({ deviceId }).populate('activeInfusion');
  if (!deviceDetails) {
    throw new ForbiddenError("Invalid Device ID");
  }
  successResponse(res, { device: deviceDetails }, "Device details", 200);
});


device.getInfusionDetails = asyncErrorHandler(async (req, res) => {
  const { deviceId } = req.params;
  if(!deviceId){
    throw new BadRequestError("Device ID is required");
  }
  const {infusionId} = req.body;
  console.log("Infusion ID:",infusionId);
  if(!infusionId){
    throw new BadRequestError("Infusion ID is required");
  }

  // Validate device and infusion relationship..
  const deviceCheck = await Device.findOne({ deviceId });
  console.log("Device Check:", deviceCheck);
  if (!deviceCheck) {
    throw new ForbiddenError("Invalid Device ID");
  }
  const infusionDetails = await Infusion.findById(infusionId);
  if(!infusionDetails){
    throw new ForbiddenError("Infusion not found for this device");
  }
  if (infusionDetails.device.toString() !== deviceCheck._id.toString()) {
    throw new ForbiddenError("Infusion does not belong to the specified device");
  }
  successResponse(res, infusionDetails, "Infusion details", 200);
});

device.getCurrentInfusionStatus = asyncErrorHandler(async (req, res) => {
  const { deviceId } = req.params;
  if (!deviceId) {
    throw new BadRequestError("Device ID is required");
  }

  // Validate device exists
  const deviceCheck = await Device.findOne({ deviceId });
  if (!deviceCheck) {
    throw new ForbiddenError("Invalid Device ID");
  }

  try {
    // Get current infusion info from MQTT service
    const currentInfo = await mqttService.getCurrentInfusionInfo(deviceId);
    
    // Get recent progress stream data
    const progressStream = await mqttService.getDeviceStreamData(deviceId, 'progress', 10);
    
    // Get device details from database
    const deviceDetails = await Device.findOne({ deviceId });
    
    // If there's a current infusion, get the full infusion details
    let infusionDetails = null;
    if (currentInfo.currentInfusion && currentInfo.currentInfusion.infusionId) {
      try {
        infusionDetails = await Infusion.findById(currentInfo.currentInfusion.infusionId);
      } catch (error) {
        console.log("Could not find infusion in database:", error.message);
      }
    }

    const response = {
      device: {
        deviceId,
        status: deviceDetails.status,
        location: deviceDetails.location,
      },
      currentInfusion: currentInfo.currentInfusion,
      latestProgress: currentInfo.latestProgress,
      latestStatus: currentInfo.latestStatus,
      infusionDetails: infusionDetails,
      recentProgress: progressStream,
      hasActiveInfusion: !!currentInfo.currentInfusion,
    };

    successResponse(res, response, "Current infusion status retrieved", 200);
  } catch (error) {
    console.error("Error getting current infusion status:", error);
    throw new Error("Failed to retrieve current infusion status");
  }
});

device.getDeviceStreamData = asyncErrorHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { type = 'progress', count = 50 } = req.query;

  if (!deviceId) {
    throw new BadRequestError("Device ID is required");
  }

  // Validate device exists
  const deviceCheck = await Device.findOne({ deviceId });
  if (!deviceCheck) {
    throw new ForbiddenError("Invalid Device ID");
  }

  // Validate stream type
  const validTypes = ['progress', 'infusion', 'status', 'error'];
  if (!validTypes.includes(type)) {
    throw new BadRequestError(`Invalid stream type. Must be one of: ${validTypes.join(', ')}`);
  }

  try {
    const streamData = await mqttService.getDeviceStreamData(deviceId, type, parseInt(count));
    
    successResponse(res, {
      deviceId,
      streamType: type,
      count: streamData.length,
      data: streamData,
    }, `${type} stream data retrieved`, 200);
  } catch (error) {
    console.error("Error getting device stream data:", error);
    throw new Error("Failed to retrieve device stream data");
  }
});

export default device;  

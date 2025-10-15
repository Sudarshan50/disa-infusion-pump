import e from "express";
import device from "../controllers/deviceController.js";
import { authorizeRoles } from "../middleware/authHandler.js";

const deviceRouter = e.Router();

deviceRouter.post("/create", device.create);
deviceRouter.get("/:deviceId", authorizeRoles("admin","attendee"), device.getDetailsById);
deviceRouter.post("/health", device.createHealthCheck);

// Device control endpoints
deviceRouter.post("/start/:deviceId",authorizeRoles("admin","attendee"), device.start);
deviceRouter.post("/stop/:deviceId", authorizeRoles("admin","attendee"), device.stop);
deviceRouter.post("/pause/:deviceId", authorizeRoles("admin","attendee"), device.pause);
deviceRouter.post("/resume/:deviceId", authorizeRoles("admin","attendee"), device.resume);

export default deviceRouter;

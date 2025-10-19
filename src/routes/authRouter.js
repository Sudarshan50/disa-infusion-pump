import e from "express";
import auth from "../controllers/authController.js";
import { authorizeRoles } from "../middleware/authHandler.js";

const authRouter = e.Router();

authRouter.post("/create", auth.createUser);
authRouter.post("/login", auth.login);
authRouter.patch(
  "/update",
  authorizeRoles("admin", "attendee"),
  auth.updateUser
);

export default authRouter;

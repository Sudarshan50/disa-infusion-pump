import e from "express";
import authRouter from "./authRouter.js";
import deviceRouter from "./deviceRouter.js";

const router = e.Router();

router.use("/auth", authRouter);
router.use("/device", deviceRouter);

export default router;

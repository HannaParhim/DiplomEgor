import { Router } from "express";
import auditRoutes from "./auditRoutes.js";
import authRoutes from "./authRoutes.js";
import certificateRoutes from "./certificateRoutes.js";
import chatRoutes from "./chatRoutes.js";
import companyRoutes from "./companyRoutes.js";
import courseRoutes from "./courseRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import departmentRoutes from "./departmentRoutes.js";
import progressRoutes from "./progressRoutes.js";
import reportRoutes from "./reportRoutes.js";
import roleRoutes from "./roleRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import userRoutes from "./userRoutes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/audit", auditRoutes);
router.use("/certificates", certificateRoutes);
router.use("/company", companyRoutes);
router.use("/users", userRoutes);
router.use("/roles", roleRoutes);
router.use("/departments", departmentRoutes);
router.use("/courses", courseRoutes);
router.use("/chat", chatRoutes);
router.use("/progress", progressRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/reports", reportRoutes);
router.use("/uploads", uploadRoutes);

export default router;

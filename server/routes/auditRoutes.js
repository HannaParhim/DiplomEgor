import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { roleMiddlewareAny } from "../middleware/roleMiddleware.js";
import { listAuditLogsController } from "../controllers/auditController.js";

const router = Router();

router.use(authMiddleware, companyMiddleware, roleMiddlewareAny("manage_users", "view_reports"));
router.get("/", listAuditLogsController);

export default router;

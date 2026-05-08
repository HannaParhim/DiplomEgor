import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  listGeneratedReportsController,
  queueReportGenerationController,
  reportSummaryController
} from "../controllers/reportController.js";
import { reportGenerationSchema } from "../utils/validationSchemas.js";

const router = Router();

router.use(authMiddleware, companyMiddleware, roleMiddleware("view_reports"));

router.get("/summary", reportSummaryController);
router.get("/jobs", listGeneratedReportsController);
router.post("/generate", validateRequest(reportGenerationSchema), queueReportGenerationController);

export default router;

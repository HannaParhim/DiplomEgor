import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { dashboardOverviewController } from "../controllers/dashboardController.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.get("/overview", dashboardOverviewController);

export default router;

import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  exportMyCertificatesController,
  listMyCertificatesController,
  verifyCertificateController
} from "../controllers/certificateController.js";
import { certificateExportSchema } from "../utils/validationSchemas.js";

const router = Router();

router.get("/verify/:code", verifyCertificateController);

router.use(authMiddleware, companyMiddleware);

router.get("/my", listMyCertificatesController);
router.post("/my/export", validateRequest(certificateExportSchema), exportMyCertificatesController);

export default router;

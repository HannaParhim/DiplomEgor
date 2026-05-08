import { Router } from "express";
import {
  getCompanyFocusController,
  getCompanySettingsController,
  updateCompanyFocusController,
  updateCompanySettingsController
} from "../controllers/companyController.js";
import { uploadFileController } from "../controllers/uploadController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { roleMiddlewareAny } from "../middleware/roleMiddleware.js";
import { uploadLogoImage, uploadSignatureImage } from "../middleware/uploadMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  companyFocusUpdateSchema,
  companySettingsUpdateSchema
} from "../utils/validationSchemas.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.get(
  "/settings",
  roleMiddlewareAny("manage_roles", "manage_users"),
  getCompanySettingsController
);
router.put(
  "/settings",
  roleMiddlewareAny("manage_roles", "manage_users"),
  validateRequest(companySettingsUpdateSchema),
  updateCompanySettingsController
);
router.get(
  "/focus",
  roleMiddlewareAny("manage_company_focus", "manage_roles", "manage_users"),
  getCompanyFocusController
);
router.put(
  "/focus",
  roleMiddlewareAny("manage_company_focus", "manage_roles", "manage_users"),
  validateRequest(companyFocusUpdateSchema),
  updateCompanyFocusController
);
router.post(
  "/logo-upload",
  roleMiddlewareAny("manage_roles", "manage_users"),
  uploadLogoImage,
  uploadFileController
);
router.post(
  "/signature-upload",
  roleMiddlewareAny("manage_roles", "manage_users"),
  uploadSignatureImage,
  uploadFileController
);

export default router;

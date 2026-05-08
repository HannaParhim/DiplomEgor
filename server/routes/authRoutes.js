import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  loginController,
  meController,
  registerCompanyController
} from "../controllers/authController.js";
import { loginSchema, registerCompanySchema } from "../utils/validationSchemas.js";

const router = Router();

router.post("/register-company", validateRequest(registerCompanySchema), registerCompanyController);
router.post("/login", validateRequest(loginSchema), loginController);
router.get("/me", authMiddleware, companyMiddleware, meController);

export default router;

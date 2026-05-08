import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  createDepartmentController,
  deleteDepartmentController,
  listDepartmentsController,
  updateDepartmentController
} from "../controllers/departmentController.js";
import {
  departmentCreateSchema,
  departmentUpdateSchema
} from "../utils/validationSchemas.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.get("/", listDepartmentsController);
router.post(
  "/",
  roleMiddleware("manage_departments"),
  validateRequest(departmentCreateSchema),
  createDepartmentController
);
router.put(
  "/:id",
  roleMiddleware("manage_departments"),
  validateRequest(departmentUpdateSchema),
  updateDepartmentController
);
router.delete("/:id", roleMiddleware("manage_departments"), deleteDepartmentController);

export default router;

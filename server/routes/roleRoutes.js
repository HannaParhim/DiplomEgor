import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { roleMiddleware, roleMiddlewareAny } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  createRoleController,
  deleteRoleController,
  listRolesController,
  updateRoleController
} from "../controllers/roleController.js";
import { roleCreateSchema, roleUpdateSchema } from "../utils/validationSchemas.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.get("/", roleMiddlewareAny("manage_roles", "manage_users"), listRolesController);
router.post("/", roleMiddleware("manage_roles"), validateRequest(roleCreateSchema), createRoleController);
router.put("/:id", roleMiddleware("manage_roles"), validateRequest(roleUpdateSchema), updateRoleController);
router.delete("/:id", roleMiddleware("manage_roles"), deleteRoleController);

export default router;

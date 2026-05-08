import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { roleMiddleware, roleMiddlewareAny } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  assignUserCoursesController,
  createUserController,
  deleteUserAssignmentController,
  deleteUserController,
  getUserController,
  listUsersController,
  resendInvitationController,
  resetUserPasswordController,
  updateUserAssignmentController,
  updateUserController
} from "../controllers/userController.js";
import {
  userAssignmentUpdateSchema,
  userCourseAssignSchema,
  userCreateSchema,
  userUpdateSchema
} from "../utils/validationSchemas.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.get(
  "/",
  roleMiddlewareAny("manage_users", "manage_departments", "assign_courses", "view_reports"),
  listUsersController
);
router.get(
  "/:id",
  roleMiddlewareAny("manage_users", "manage_departments", "assign_courses", "view_reports"),
  getUserController
);
router.post("/", roleMiddleware("manage_users"), validateRequest(userCreateSchema), createUserController);
router.post(
  "/:id/assign-courses",
  roleMiddlewareAny("manage_users", "assign_courses"),
  validateRequest(userCourseAssignSchema),
  assignUserCoursesController
);
router.put("/:id", roleMiddleware("manage_users"), validateRequest(userUpdateSchema), updateUserController);
router.put(
  "/:id/assignments/:assignmentId",
  roleMiddlewareAny("manage_users", "assign_courses"),
  validateRequest(userAssignmentUpdateSchema),
  updateUserAssignmentController
);
router.delete(
  "/:id/assignments/:assignmentId",
  roleMiddlewareAny("manage_users", "assign_courses"),
  deleteUserAssignmentController
);
router.post("/:id/reset-password", roleMiddleware("manage_users"), resetUserPasswordController);
router.post("/:id/resend-invite", roleMiddleware("manage_users"), resendInvitationController);
router.delete("/:id", roleMiddleware("manage_users"), deleteUserController);

export default router;

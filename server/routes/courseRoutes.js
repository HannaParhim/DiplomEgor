import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  addLessonController,
  addModuleController,
  assignCourseController,
  createCourseController,
  deleteCourseController,
  deleteLessonController,
  deleteModuleController,
  getCourseController,
  listCoursesController,
  listMyCoursesController,
  updateLessonController,
  updateModuleController,
  updateCourseController
} from "../controllers/courseController.js";
import {
  courseAssignSchema,
  courseCreateSchema,
  courseUpdateSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
  moduleCreateSchema,
  moduleUpdateSchema
} from "../utils/validationSchemas.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.get("/", listCoursesController);
router.get("/my", listMyCoursesController);
router.post("/", roleMiddleware("create_courses"), validateRequest(courseCreateSchema), createCourseController);
router.post("/assign", roleMiddleware("assign_courses"), validateRequest(courseAssignSchema), assignCourseController);
router.post(
  "/:courseId/modules",
  roleMiddleware("edit_courses"),
  validateRequest(moduleCreateSchema),
  addModuleController
);
router.put(
  "/:courseId/modules/:moduleId",
  roleMiddleware("edit_courses"),
  validateRequest(moduleUpdateSchema),
  updateModuleController
);
router.delete(
  "/:courseId/modules/:moduleId",
  roleMiddleware("edit_courses"),
  deleteModuleController
);
router.post(
  "/:courseId/modules/:moduleId/lessons",
  roleMiddleware("edit_courses"),
  validateRequest(lessonCreateSchema),
  addLessonController
);
router.put(
  "/:courseId/modules/:moduleId/lessons/:lessonId",
  roleMiddleware("edit_courses"),
  validateRequest(lessonUpdateSchema),
  updateLessonController
);
router.delete(
  "/:courseId/modules/:moduleId/lessons/:lessonId",
  roleMiddleware("edit_courses"),
  deleteLessonController
);
router.get("/:id", getCourseController);
router.put("/:id", roleMiddleware("edit_courses"), validateRequest(courseUpdateSchema), updateCourseController);
router.delete("/:id", roleMiddleware("delete_courses"), deleteCourseController);

export default router;

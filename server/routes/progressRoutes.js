import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  completeLessonController,
  getCourseProgressController,
  submitQuizAttemptController
} from "../controllers/progressController.js";
import { quizSubmissionSchema } from "../utils/validationSchemas.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.get("/:courseId", getCourseProgressController);
router.post("/lessons/:lessonId/complete", completeLessonController);
router.post(
  "/lessons/:lessonId/quiz-submit",
  validateRequest(quizSubmissionSchema),
  submitQuizAttemptController
);

export default router;

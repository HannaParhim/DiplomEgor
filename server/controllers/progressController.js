import { asyncHandler } from "../utils/asyncHandler.js";
import { parseId } from "../utils/ids.js";
import {
  getCourseProgress,
  markLessonCompleted,
  submitQuizAttempt
} from "../services/progressService.js";

export const getCourseProgressController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.courseId, "ID курса");
  const result = await getCourseProgress(req.companyId, courseId, req.user);
  res.json(result);
});

export const completeLessonController = asyncHandler(async (req, res) => {
  const lessonId = parseId(req.params.lessonId, "ID урока");
  const result = await markLessonCompleted(req.companyId, lessonId, req.user.id);
  res.json(result);
});

export const submitQuizAttemptController = asyncHandler(async (req, res) => {
  const lessonId = parseId(req.params.lessonId, "ID урока");
  const result = await submitQuizAttempt(req.companyId, lessonId, req.user.id, req.body);
  res.json(result);
});

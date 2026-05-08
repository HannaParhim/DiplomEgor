import { asyncHandler } from "../utils/asyncHandler.js";
import { parseId } from "../utils/ids.js";
import {
  addLesson,
  addModule,
  assignCourse,
  createCourse,
  deleteCourse,
  deleteLesson,
  deleteModule,
  getCourseById,
  listCourses,
  listMyCourses,
  updateCourse,
  updateLesson,
  updateModule
} from "../services/courseService.js";

export const listCoursesController = asyncHandler(async (req, res) => {
  const courses = await listCourses(req.companyId, req.user, req.query.scope);
  res.json(courses);
});

export const listMyCoursesController = asyncHandler(async (req, res) => {
  const courses = await listMyCourses(req.companyId, req.user);
  res.json(courses);
});

export const getCourseController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.id, "ID курса");
  const course = await getCourseById(req.companyId, courseId, req.user);
  res.json(course);
});

export const createCourseController = asyncHandler(async (req, res) => {
  const course = await createCourse(req.companyId, req.user.id, req.body);
  res.status(201).json(course);
});

export const updateCourseController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.id, "ID курса");
  const course = await updateCourse(req.companyId, courseId, req.body, req.user.id);
  res.json(course);
});

export const deleteCourseController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.id, "ID курса");
  const result = await deleteCourse(req.companyId, courseId, req.user.id);
  res.json(result);
});

export const addModuleController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.courseId, "ID курса");
  const module = await addModule(req.companyId, courseId, req.body, req.user.id);
  res.status(201).json(module);
});

export const updateModuleController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.courseId, "ID курса");
  const moduleId = parseId(req.params.moduleId, "ID модуля");
  const module = await updateModule(req.companyId, courseId, moduleId, req.body, req.user.id);
  res.json(module);
});

export const deleteModuleController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.courseId, "ID курса");
  const moduleId = parseId(req.params.moduleId, "ID модуля");
  const result = await deleteModule(req.companyId, courseId, moduleId, req.user.id);
  res.json(result);
});

export const addLessonController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.courseId, "ID курса");
  const moduleId = parseId(req.params.moduleId, "ID модуля");
  const lesson = await addLesson(req.companyId, courseId, moduleId, req.body, req.user.id);
  res.status(201).json(lesson);
});

export const updateLessonController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.courseId, "ID курса");
  const moduleId = parseId(req.params.moduleId, "ID модуля");
  const lessonId = parseId(req.params.lessonId, "ID урока");
  const lesson = await updateLesson(
    req.companyId,
    courseId,
    moduleId,
    lessonId,
    req.body,
    req.user.id
  );
  res.json(lesson);
});

export const deleteLessonController = asyncHandler(async (req, res) => {
  const courseId = parseId(req.params.courseId, "ID курса");
  const moduleId = parseId(req.params.moduleId, "ID модуля");
  const lessonId = parseId(req.params.lessonId, "ID урока");
  const result = await deleteLesson(req.companyId, courseId, moduleId, lessonId, req.user.id);
  res.json(result);
});

export const assignCourseController = asyncHandler(async (req, res) => {
  const result = await assignCourse(req.companyId, req.user.id, req.body);
  res.status(201).json(result);
});

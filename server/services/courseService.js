import prisma from "../database/prisma.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { recordAuditEvent } from "./auditService.js";
import { queueNotification } from "./notificationService.js";
import { emitToUsers } from "./realtimeService.js";

const MANAGEMENT_PERMISSIONS = [
  "create_courses",
  "edit_courses",
  "delete_courses",
  "assign_courses"
];

const CONTENT_PERMISSIONS = ["create_courses", "edit_courses", "delete_courses"];

const courseQueryInclude = (currentUser, includeAssignments, includeAllAssignments) => ({
  creator: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  assignments: includeAssignments
    ? includeAllAssignments
      ? {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                department: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            },
            assigner: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      : {
          where: {
            userId: currentUser.id
          },
          include: {
            assigner: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
    : false,
  modules: {
    orderBy: {
      orderIndex: "asc"
    },
    include: {
      lessons: {
        orderBy: {
          orderIndex: "asc"
        },
        include: {
          progressRecords: {
            where: {
              userId: currentUser.id,
              completed: true
            },
            select: {
              lessonId: true,
              completedAt: true
            }
          },
          quiz: {
            include: {
              questions: {
                include: {
                  answers: true
                }
              }
            }
          }
        }
      }
    }
  }
});

export const canManageCourses = (currentUser) =>
  MANAGEMENT_PERMISSIONS.some((permission) => currentUser.permissions?.[permission]);

export const canEditCourseContent = (currentUser) =>
  CONTENT_PERMISSIONS.some((permission) => currentUser.permissions?.[permission]);

const canViewCompanyCourses = (currentUser) =>
  canManageCourses(currentUser) ||
  Boolean(currentUser.permissions?.view_reports) ||
  Boolean(currentUser.permissions?.manage_users);

const countLessons = (modules = []) =>
  modules.reduce((total, module) => total + module.lessons.length, 0);

const countCompletedLessons = (modules = []) =>
  modules.reduce(
    (total, module) =>
      total + module.lessons.filter((lesson) => lesson.progressRecords.length > 0).length,
    0
  );

const serializeQuestion = (question, revealCorrectAnswers) => ({
  id: question.id,
  question: question.question,
  type: question.type,
  answers: question.answers.map((answer) => ({
    id: answer.id,
    answer: answer.answer,
    ...(revealCorrectAnswers ? { isCorrect: answer.isCorrect } : {})
  }))
});

const serializeCourse = (
  course,
  currentUser,
  { includeAssignments = false, revealCorrectAnswers = false } = {}
) => {
  const totalLessons = countLessons(course.modules);
  const completedLessons = countCompletedLessons(course.modules);
  const progressPercent = totalLessons
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;

  return {
    id: course.id,
    companyId: course.companyId,
    title: course.title,
    description: course.description,
    status: course.status,
    createdAt: course.createdAt,
    creator: course.creator
      ? {
          id: course.creator.id,
          name: course.creator.name,
          email: course.creator.email
        }
      : null,
    assignmentCount: includeAssignments ? course.assignments.length : undefined,
    myAssignment:
      course.assignments?.find((assignment) => assignment.userId === currentUser.id) ?? null,
    modulesCount: course.modules.length,
    lessonsCount: totalLessons,
    completedLessons,
    progressPercent,
    modules: course.modules.map((module) => ({
      id: module.id,
      title: module.title,
      orderIndex: module.orderIndex,
      lessonsCount: module.lessons.length,
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        content: lesson.content,
        videoUrl: lesson.videoUrl,
        fileUrl: lesson.fileUrl,
        orderIndex: lesson.orderIndex,
        isCompleted: lesson.progressRecords.length > 0,
        completedAt: lesson.progressRecords[0]?.completedAt ?? null,
        quiz: lesson.quiz
          ? {
              id: lesson.quiz.id,
              title: lesson.quiz.title,
              passingScore: lesson.quiz.passingScore,
              timeLimit: lesson.quiz.timeLimit,
              questions: lesson.quiz.questions.map((question) =>
                serializeQuestion(question, revealCorrectAnswers)
              )
            }
          : null
      }))
    })),
    assignments: includeAssignments
      ? course.assignments.map((assignment) => ({
          id: assignment.id,
          userId: assignment.userId,
          assignedAt: assignment.assignedAt,
          deadline: assignment.deadline,
          user: assignment.user
            ? {
                id: assignment.user.id,
                name: assignment.user.name,
                email: assignment.user.email,
                department: assignment.user.department
                  ? {
                      id: assignment.user.department.id,
                      name: assignment.user.department.name
                    }
                  : null
              }
            : null,
          assignedBy: assignment.assigner
            ? {
                id: assignment.assigner.id,
                name: assignment.assigner.name
              }
            : null
        }))
      : undefined
  };
};

const ensureCourseExists = async (companyId, courseId) => {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      companyId
    }
  });

  if (!course) {
    throw notFound("Курс не найден");
  }

  return course;
};

const ensureModuleExists = async (companyId, courseId, moduleId) => {
  const module = await prisma.courseModule.findFirst({
    where: {
      id: moduleId,
      courseId,
      course: {
        companyId
      }
    },
    include: {
      lessons: {
        select: {
          id: true
        }
      }
    }
  });

  if (!module) {
    throw notFound("Модуль не найден");
  }

  return module;
};

const ensureLessonExists = async (companyId, courseId, moduleId, lessonId) => {
  const lesson = await prisma.lesson.findFirst({
    where: {
      id: lessonId,
      moduleId,
      module: {
        courseId,
        course: {
          companyId
        }
      }
    },
    include: {
      quiz: {
        include: {
          questions: {
            include: {
              answers: true
            }
          }
        }
      }
    }
  });

  if (!lesson) {
    throw notFound("Урок не найден");
  }

  return lesson;
};

const ensureUniqueModuleOrder = async (courseId, orderIndex, excludeModuleId) => {
  if (orderIndex === undefined) {
    return;
  }

  const duplicateIndex = await prisma.courseModule.findFirst({
    where: {
      courseId,
      orderIndex,
      ...(excludeModuleId
        ? {
            NOT: {
              id: excludeModuleId
            }
          }
        : {})
    }
  });

  if (duplicateIndex) {
    throw badRequest("Модуль с таким порядковым номером уже существует");
  }
};

const ensureUniqueLessonOrder = async (moduleId, orderIndex, excludeLessonId) => {
  if (orderIndex === undefined) {
    return;
  }

  const duplicateIndex = await prisma.lesson.findFirst({
    where: {
      moduleId,
      orderIndex,
      ...(excludeLessonId
        ? {
            NOT: {
              id: excludeLessonId
            }
          }
        : {})
    }
  });

  if (duplicateIndex) {
    throw badRequest("Урок с таким порядковым номером уже существует");
  }
};

const normalizeQuestionAnswers = (question) =>
  (question.answers ?? []).map((answer) => ({
    answer: answer.answer,
    isCorrect: Boolean(answer.isCorrect)
  }));

const validateQuizPayload = (quiz) => {
  if (!quiz || quiz.questions.length === 0) {
    throw badRequest("Тест должен содержать хотя бы один вопрос");
  }

  quiz.questions.forEach((question, index) => {
    const correctAnswers = question.answers.filter((answer) => answer.isCorrect);

    if (question.type === "text") {
      if (correctAnswers.length === 0) {
        throw badRequest(`В текстовом вопросе №${index + 1} нужно указать хотя бы один правильный ответ`);
      }

      return;
    }

    if (question.answers.length < 2) {
      throw badRequest(`В вопросе №${index + 1} должно быть минимум два варианта ответа`);
    }

    if (correctAnswers.length === 0) {
      throw badRequest(`В вопросе №${index + 1} нужно отметить правильный ответ`);
    }

    if (question.type === "single_choice" && correctAnswers.length !== 1) {
      throw badRequest(`В вопросе №${index + 1} с одним выбором должен быть ровно один правильный ответ`);
    }
  });
};

const buildQuizCreateData = (quiz) => ({
  title: quiz.title,
  passingScore: quiz.passingScore,
  timeLimit: quiz.timeLimit ?? null,
  questions: {
    create: quiz.questions.map((question) => ({
      question: question.question,
      type: question.type,
      answers: {
        create: normalizeQuestionAnswers(question)
      }
    }))
  }
});

const buildQuizUpdateData = (quiz) => ({
  title: quiz.title,
  passingScore: quiz.passingScore,
  timeLimit: quiz.timeLimit ?? null,
  questions: {
    deleteMany: {},
    create: quiz.questions.map((question) => ({
      question: question.question,
      type: question.type,
      answers: {
        create: normalizeQuestionAnswers(question)
      }
    }))
  }
});

const getNextModuleOrder = async (courseId) => {
  const lastModule = await prisma.courseModule.findFirst({
    where: { courseId },
    orderBy: {
      orderIndex: "desc"
    }
  });

  return (lastModule?.orderIndex ?? 0) + 1;
};

const getNextLessonOrder = async (moduleId) => {
  const lastLesson = await prisma.lesson.findFirst({
    where: { moduleId },
    orderBy: {
      orderIndex: "desc"
    }
  });

  return (lastLesson?.orderIndex ?? 0) + 1;
};

export async function listCourses(companyId, currentUser, requestedScope = "company") {
  const manageMode = canViewCompanyCourses(currentUser);
  const scope = requestedScope === "company" && manageMode ? "company" : "my";
  const includeAssignments = scope === "company" || scope === "my";

  const courses = await prisma.course.findMany({
    where:
      scope === "company"
        ? { companyId }
        : {
            companyId,
            assignments: {
              some: {
                userId: currentUser.id
              }
            }
          },
    include: courseQueryInclude(currentUser, includeAssignments, scope === "company"),
    orderBy: {
      createdAt: "desc"
    }
  });

  return courses.map((course) =>
    serializeCourse(course, currentUser, {
      includeAssignments: scope === "company",
      revealCorrectAnswers: canEditCourseContent(currentUser)
    })
  );
}

export const listMyCourses = (companyId, currentUser) =>
  listCourses(companyId, currentUser, "my");

export async function getCourseById(companyId, courseId, currentUser) {
  const manageMode = canViewCompanyCourses(currentUser);

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      companyId
    },
    include: courseQueryInclude(currentUser, true, manageMode)
  });

  if (!course) {
    throw notFound("Курс не найден");
  }

  if (!manageMode && course.assignments.length === 0) {
    throw forbidden("Курс не назначен текущему пользователю");
  }

  return serializeCourse(course, currentUser, {
    includeAssignments: manageMode,
    revealCorrectAnswers: canEditCourseContent(currentUser)
  });
}

export async function createCourse(companyId, currentUserId, payload) {
  const course = await prisma.course.create({
    data: {
      companyId,
      title: payload.title,
      description: payload.description ?? null,
      createdBy: currentUserId,
      status: payload.status
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.created",
    entityType: "course",
    entityId: course.id,
    metadata: {
      title: course.title,
      status: course.status
    }
  });

  return course;
}

export async function updateCourse(companyId, courseId, payload, currentUserId = null) {
  await ensureCourseExists(companyId, courseId);

  const course = await prisma.course.update({
    where: { id: courseId },
    data: {
      title: payload.title ?? undefined,
      description: payload.description === undefined ? undefined : payload.description,
      status: payload.status ?? undefined
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.updated",
    entityType: "course",
    entityId: courseId,
    metadata: {
      changedFields: Object.keys(payload)
    }
  });

  return course;
}

export async function deleteCourse(companyId, courseId, currentUserId = null) {
  const course = await ensureCourseExists(companyId, courseId);

  await prisma.course.delete({
    where: { id: courseId }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.deleted",
    entityType: "course",
    entityId: courseId,
    metadata: {
      title: course.title
    }
  });

  return { deleted: true };
}

export async function addModule(companyId, courseId, payload, currentUserId = null) {
  await ensureCourseExists(companyId, courseId);

  const orderIndex = payload.orderIndex ?? (await getNextModuleOrder(courseId));
  await ensureUniqueModuleOrder(courseId, orderIndex);

  const module = await prisma.courseModule.create({
    data: {
      courseId,
      title: payload.title,
      orderIndex
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.module_created",
    entityType: "course_module",
    entityId: module.id,
    metadata: {
      courseId,
      title: module.title
    }
  });

  return module;
}

export async function updateModule(companyId, courseId, moduleId, payload, currentUserId = null) {
  const module = await ensureModuleExists(companyId, courseId, moduleId);
  const orderIndex = payload.orderIndex ?? module.orderIndex;

  await ensureUniqueModuleOrder(courseId, orderIndex, moduleId);

  const updatedModule = await prisma.courseModule.update({
    where: {
      id: moduleId
    },
    data: {
      title: payload.title ?? undefined,
      orderIndex
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.module_updated",
    entityType: "course_module",
    entityId: moduleId,
    metadata: {
      courseId,
      changedFields: Object.keys(payload)
    }
  });

  return updatedModule;
}

export async function deleteModule(companyId, courseId, moduleId, currentUserId = null) {
  const module = await ensureModuleExists(companyId, courseId, moduleId);

  await prisma.courseModule.delete({
    where: {
      id: moduleId
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.module_deleted",
    entityType: "course_module",
    entityId: moduleId,
    metadata: {
      courseId,
      title: module.title
    }
  });

  return { deleted: true };
}

export async function addLesson(companyId, courseId, moduleId, payload, currentUserId = null) {
  await ensureModuleExists(companyId, courseId, moduleId);

  if (payload.quiz && payload.type !== "quiz") {
    throw badRequest("Параметры теста можно передавать только для урока типа 'тест'");
  }

  if (payload.type === "quiz") {
    if (!payload.quiz) {
      throw badRequest("Для урока типа 'тест' нужно передать параметры теста");
    }

    validateQuizPayload(payload.quiz);
  }

  const orderIndex = payload.orderIndex ?? (await getNextLessonOrder(moduleId));
  await ensureUniqueLessonOrder(moduleId, orderIndex);

  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      title: payload.title,
      content: payload.content ?? null,
      type: payload.type,
      videoUrl: payload.videoUrl ?? null,
      fileUrl: payload.fileUrl ?? null,
      orderIndex,
      quiz: payload.quiz
        ? {
            create: buildQuizCreateData(payload.quiz)
          }
        : undefined
    },
    include: {
      quiz: {
        include: {
          questions: {
            include: {
              answers: true
            }
          }
        }
      }
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.lesson_created",
    entityType: "lesson",
    entityId: lesson.id,
    metadata: {
      courseId,
      moduleId,
      type: lesson.type,
      title: lesson.title
    }
  });

  return lesson;
}

export async function updateLesson(
  companyId,
  courseId,
  moduleId,
  lessonId,
  payload,
  currentUserId = null
) {
  const lesson = await ensureLessonExists(companyId, courseId, moduleId, lessonId);
  const nextType = payload.type ?? lesson.type;
  const orderIndex = payload.orderIndex ?? lesson.orderIndex;

  await ensureUniqueLessonOrder(moduleId, orderIndex, lessonId);

  if (payload.quiz && nextType !== "quiz") {
    throw badRequest("Параметры теста можно передавать только для урока типа 'тест'");
  }

  if (nextType === "quiz") {
    if (payload.quiz) {
      validateQuizPayload(payload.quiz);
    } else if (!lesson.quiz) {
      throw badRequest("Для урока типа 'тест' нужно передать параметры теста");
    }
  }

  const updatedLesson = await prisma.$transaction(async (tx) => {
    if (nextType !== "quiz" && lesson.quiz) {
      await tx.quiz.delete({
        where: {
          id: lesson.quiz.id
        }
      });
    }

    await tx.lesson.update({
      where: {
        id: lessonId
      },
      data: {
        title: payload.title ?? undefined,
        content: payload.content === undefined ? undefined : payload.content,
        type: nextType,
        videoUrl: payload.videoUrl === undefined ? undefined : payload.videoUrl,
        fileUrl: payload.fileUrl === undefined ? undefined : payload.fileUrl,
        orderIndex
      }
    });

    if (nextType === "quiz" && payload.quiz) {
      await tx.quiz.upsert({
        where: {
          lessonId
        },
        create: {
          lessonId,
          ...buildQuizCreateData(payload.quiz)
        },
        update: buildQuizUpdateData(payload.quiz)
      });
    }

    return tx.lesson.findUnique({
      where: {
        id: lessonId
      },
      include: {
        quiz: {
          include: {
            questions: {
              include: {
                answers: true
              }
            }
          }
        }
      }
    });
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.lesson_updated",
    entityType: "lesson",
    entityId: lessonId,
    metadata: {
      courseId,
      moduleId,
      changedFields: Object.keys(payload)
    }
  });

  return updatedLesson;
}

export async function deleteLesson(companyId, courseId, moduleId, lessonId, currentUserId = null) {
  const lesson = await ensureLessonExists(companyId, courseId, moduleId, lessonId);

  await prisma.lesson.delete({
    where: {
      id: lessonId
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.lesson_deleted",
    entityType: "lesson",
    entityId: lessonId,
    metadata: {
      courseId,
      moduleId,
      title: lesson.title
    }
  });

  return { deleted: true };
}

export async function assignCourse(companyId, currentUserId, payload) {
  const course = await ensureCourseExists(companyId, payload.courseId);

  const uniqueUserIds = [...new Set(payload.userIds)];
  const users = await prisma.user.findMany({
    where: {
      companyId,
      id: {
        in: uniqueUserIds
      },
      status: {
        in: ["active", "invited"]
      }
    },
    select: {
      id: true
    }
  });

  if (users.length !== uniqueUserIds.length) {
    throw badRequest(
      "Все назначаемые сотрудники должны существовать в этой компании и иметь активный или приглашённый статус"
    );
  }

  const existingAssignments = await prisma.courseAssignment.findMany({
    where: {
      courseId: payload.courseId,
      userId: {
        in: uniqueUserIds
      }
    },
    select: {
      userId: true
    }
  });

  const existingSet = new Set(existingAssignments.map((assignment) => assignment.userId));
  const assignmentsToCreate = uniqueUserIds
    .filter((userId) => !existingSet.has(userId))
    .map((userId) => ({
      courseId: payload.courseId,
      userId,
      assignedBy: currentUserId,
      deadline: payload.deadline ? new Date(payload.deadline) : null
    }));

  if (assignmentsToCreate.length > 0) {
    await prisma.courseAssignment.createMany({
      data: assignmentsToCreate
    });

    await queueNotification({
      companyId,
      triggeredById: currentUserId,
      recipients: assignmentsToCreate.map((assignment) => assignment.userId),
      title: `Вам назначен курс «${course.title}»`,
      body: "Откройте раздел курсов, чтобы начать обучение и посмотреть дедлайн.",
      category: "course_assignment",
      metadata: {
        courseId: course.id
      }
    });

    emitToUsers(
      assignmentsToCreate.map((assignment) => assignment.userId),
      "courses:changed",
      {
        type: "assigned",
        courseId: course.id
      }
    );
  }

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "course.assigned",
    entityType: "course",
    entityId: course.id,
    metadata: {
      userIds: uniqueUserIds,
      createdCount: assignmentsToCreate.length,
      skippedCount: existingAssignments.length
    }
  });

  return {
    createdCount: assignmentsToCreate.length,
    skippedCount: existingAssignments.length,
    notificationQueued: assignmentsToCreate.length > 0
  };
}

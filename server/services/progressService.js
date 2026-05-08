import prisma from "../database/prisma.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { recordAuditEvent } from "./auditService.js";
import {
  ensureCertificateReady,
  serializeCertificate
} from "./certificateService.js";
import { canManageCourses } from "./courseService.js";

const countLessons = (modules = []) =>
  modules.reduce((total, module) => total + module.lessons.length, 0);

const groupProgressByUser = (progressRows) =>
  progressRows.reduce((accumulator, row) => {
    const currentSet = accumulator.get(row.userId) ?? new Set();
    currentSet.add(row.lessonId);
    accumulator.set(row.userId, currentSet);
    return accumulator;
  }, new Map());

const issueCertificateIfCompleted = async (companyId, courseId, userId) => {
  const progressSnapshot = await getCourseProgress(companyId, courseId, {
    id: userId,
    companyId,
    permissions: {}
  });

  let certificate = null;

  if (progressSnapshot.myProgress.percentage === 100) {
    certificate = await ensureCertificateReady({
      companyId,
      courseId,
      userId,
      requestedById: userId
    });
  }

  return {
    ...progressSnapshot,
    myCertificate: certificate ?? progressSnapshot.myCertificate ?? null,
    certificateReady: Boolean(certificate ?? progressSnapshot.myCertificate)
  };
};

const ensureAssignedLesson = async (companyId, lessonId, userId) => {
  const lesson = await prisma.lesson.findFirst({
    where: {
      id: lessonId,
      module: {
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
      },
      module: {
        include: {
          course: {
            include: {
              modules: {
                include: {
                  lessons: {
                    select: {
                      id: true
                    }
                  }
                }
              },
              assignments: {
                where: {
                  userId
                },
                select: {
                  id: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!lesson) {
    throw notFound("Урок не найден");
  }

  if (lesson.module.course.assignments.length === 0) {
    throw forbidden("Курс не назначен текущему пользователю");
  }

  return lesson;
};

export async function getCourseProgress(companyId, courseId, currentUser) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      companyId
    },
    include: {
      modules: {
        include: {
          lessons: {
            select: {
              id: true
            }
          }
        }
      },
      assignments: {
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
          }
        }
      }
    }
  });

  if (!course) {
    throw notFound("Курс не найден");
  }

  const totalLessons = countLessons(course.modules);
  const hasAssignment = course.assignments.some(
    (assignment) => assignment.userId === currentUser.id
  );
  const manageMode = canManageCourses(currentUser) || currentUser.permissions?.view_reports;

  if (!manageMode && !hasAssignment) {
    throw forbidden("Курс не назначен текущему пользователю");
  }

  const lessonIds = course.modules.flatMap((module) =>
    module.lessons.map((lesson) => lesson.id)
  );

  const currentUserProgress = await prisma.progress.findMany({
    where: {
      userId: currentUser.id,
      lessonId: {
        in: lessonIds
      },
      completed: true
    },
    select: {
      lessonId: true,
      completedAt: true
    }
  });

  const myCompletedLessons = currentUserProgress.length;
  const certificate = await prisma.certificate.findUnique({
    where: {
      userId_courseId: {
        userId: currentUser.id,
        courseId
      }
    }
  });
  const myProgress = {
    totalLessons,
    completedLessons: myCompletedLessons,
    percentage: totalLessons
      ? Math.round((myCompletedLessons / totalLessons) * 100)
      : 0,
    completedLessonIds: currentUserProgress.map((row) => row.lessonId)
  };

  let teamProgress = [];

  if (manageMode && course.assignments.length > 0) {
    const userIds = course.assignments.map((assignment) => assignment.userId);
    const progressRows = await prisma.progress.findMany({
      where: {
        userId: {
          in: userIds
        },
        lessonId: {
          in: lessonIds
        },
        completed: true
      },
      select: {
        userId: true,
        lessonId: true
      }
    });

    const groupedProgress = groupProgressByUser(progressRows);

    teamProgress = course.assignments.map((assignment) => {
      const completedSet = groupedProgress.get(assignment.userId) ?? new Set();
      const completedLessons = completedSet.size;
      const percentage = totalLessons
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

      return {
        assignmentId: assignment.id,
        assignedAt: assignment.assignedAt,
        deadline: assignment.deadline,
        user: assignment.user,
        completedLessons,
        totalLessons,
        percentage,
        overdue:
          Boolean(assignment.deadline) &&
          new Date(assignment.deadline) < new Date() &&
          percentage < 100
      };
    });
  }

  return {
    courseId,
    totalLessons,
    myProgress,
    myCertificate: serializeCertificate(certificate),
    teamProgress
  };
}

export async function markLessonCompleted(companyId, lessonId, userId) {
  const lesson = await ensureAssignedLesson(companyId, lessonId, userId);

  await prisma.progress.upsert({
    where: {
      userId_lessonId: {
        userId,
        lessonId
      }
    },
    update: {
      completed: true,
      completedAt: new Date()
    },
    create: {
      userId,
      lessonId,
      completed: true,
      completedAt: new Date()
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: userId,
    action: "lesson.completed",
    entityType: "lesson",
    entityId: lessonId,
    metadata: {
      courseId: lesson.module.course.id
    }
  });

  return issueCertificateIfCompleted(companyId, lesson.module.course.id, userId);
}

export async function submitQuizAttempt(companyId, lessonId, userId, payload) {
  const lesson = await ensureAssignedLesson(companyId, lessonId, userId);

  if (!lesson.quiz) {
    throw badRequest("Для этого урока тест не настроен");
  }

  if (lesson.quiz.questions.length === 0) {
    throw badRequest("В тесте нет вопросов");
  }

  const submittedAnswers = new Map(
    payload.answers.map((answer) => [answer.questionId, answer])
  );

  let correctCount = 0;

  const questionResults = lesson.quiz.questions.map((question) => {
    const response = submittedAnswers.get(question.id);
    const correctAnswers = question.answers.filter((answer) => answer.isCorrect);

    let isCorrect = false;

    if (question.type === "text") {
      const normalizedText = response?.text?.trim().toLowerCase() ?? "";
      const acceptedAnswers = correctAnswers.map((answer) =>
        answer.answer.trim().toLowerCase()
      );
      isCorrect = normalizedText.length > 0 && acceptedAnswers.includes(normalizedText);
    } else {
      const submittedIds = [...new Set(response?.answerIds ?? [])].sort((a, b) => a - b);
      const correctIds = correctAnswers.map((answer) => answer.id).sort((a, b) => a - b);
      isCorrect =
        submittedIds.length === correctIds.length &&
        submittedIds.every((answerId, index) => answerId === correctIds[index]);
    }

    if (isCorrect) {
      correctCount += 1;
    }

    return {
      questionId: question.id,
      isCorrect
    };
  });

  const score = Math.round((correctCount / lesson.quiz.questions.length) * 100);
  const passed = score >= lesson.quiz.passingScore;

  const progress = passed
    ? await markLessonCompleted(companyId, lessonId, userId)
    : await getCourseProgress(companyId, lesson.module.course.id, {
        id: userId,
        companyId,
        permissions: {}
      });

  await recordAuditEvent({
    companyId,
    actorId: userId,
    action: "quiz.submitted",
    entityType: "quiz",
    entityId: lesson.quiz.id,
    metadata: {
      lessonId,
      score,
      passed
    }
  });

  return {
    lessonId,
    quizId: lesson.quiz.id,
    score,
    passingScore: lesson.quiz.passingScore,
    totalQuestions: lesson.quiz.questions.length,
    correctAnswers: correctCount,
    passed,
    questionResults,
    progress
  };
}

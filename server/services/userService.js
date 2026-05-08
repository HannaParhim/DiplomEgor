import crypto from "node:crypto";
import prisma from "../database/prisma.js";
import { badRequest, notFound } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";
import { parsePermissions } from "../utils/permissions.js";
import { recordAuditEvent } from "./auditService.js";
import { serializeCertificate } from "./certificateService.js";
import {
  createInvitationForUser,
  resendInvitationEmail
} from "./invitationService.js";
import { queueNotification } from "./notificationService.js";
import { emitToUser } from "./realtimeService.js";

const userInclude = {
  role: true,
  department: true
};

const userDetailInclude = {
  role: true,
  department: true,
  progressRecords: {
    where: {
      completed: true
    },
    select: {
      lessonId: true
    }
  },
  receivedAssignments: {
    orderBy: [
      {
        deadline: "asc"
      },
      {
        assignedAt: "desc"
      }
    ],
    include: {
      course: {
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          modules: {
            select: {
              lessons: {
                select: {
                  id: true
                }
              }
            }
          }
        }
      },
      assigner: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  },
  certificates: {
    orderBy: {
      issuedAt: "desc"
    },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          status: true
        }
      }
    }
  }
};

const serializeUser = (user) => ({
  id: user.id,
  companyId: user.companyId,
  name: user.name,
  email: user.email,
  position: user.position,
  status: user.status,
  createdAt: user.createdAt,
  role: user.role
    ? {
        id: user.role.id,
        name: user.role.name,
        permissions: parsePermissions(user.role.permissions)
      }
    : null,
  department: user.department
    ? {
        id: user.department.id,
        name: user.department.name
      }
    : null
});

const countCourseLessons = (course) =>
  course.modules.reduce((total, module) => total + module.lessons.length, 0);

const serializeAssignment = (assignment, completedLessonsSet, certificateByCourseId) => {
  const lessonIds = assignment.course.modules.flatMap((module) =>
    module.lessons.map((lesson) => lesson.id)
  );
  const lessonsCount = lessonIds.length;
  const completedLessons = lessonIds.filter((lessonId) => completedLessonsSet.has(lessonId)).length;
  const progressPercent = lessonsCount ? Math.round((completedLessons / lessonsCount) * 100) : 0;
  const certificate = certificateByCourseId.get(assignment.courseId);
  const isOverdue =
    Boolean(assignment.deadline) &&
    new Date(assignment.deadline).getTime() < Date.now() &&
    !certificate;

  return {
    id: assignment.id,
    courseId: assignment.courseId,
    assignedAt: assignment.assignedAt,
    deadline: assignment.deadline,
    isOverdue,
    lessonsCount,
    completedLessons,
    progressPercent,
    hasCertificate: Boolean(certificate),
    course: {
      id: assignment.course.id,
      title: assignment.course.title,
      status: assignment.course.status,
      createdAt: assignment.course.createdAt,
      lessonsCount: countCourseLessons(assignment.course)
    },
    assignedBy: assignment.assigner
      ? {
          id: assignment.assigner.id,
          name: assignment.assigner.name,
          email: assignment.assigner.email
        }
      : null,
    certificate: certificate ?? null
  };
};

const serializeUserDetails = (user) => {
  const completedLessonsSet = new Set(user.progressRecords.map((record) => record.lessonId));
  const certificates = user.certificates.map((certificate) => ({
    ...serializeCertificate(certificate),
    course: certificate.course
      ? {
          id: certificate.course.id,
          title: certificate.course.title,
          status: certificate.course.status
        }
      : null
  }));
  const certificateByCourseId = new Map(certificates.map((certificate) => [certificate.course.id, certificate]));
  const assignments = user.receivedAssignments.map((assignment) =>
    serializeAssignment(assignment, completedLessonsSet, certificateByCourseId)
  );
  const completedCoursesCount = certificates.length;
  const activeAssignmentsCount = assignments.filter((assignment) => !assignment.hasCertificate).length;
  const overdueAssignmentsCount = assignments.filter((assignment) => assignment.isOverdue).length;

  return {
    ...serializeUser(user),
    assignments,
    certificates,
    stats: {
      assignedCoursesCount: assignments.length,
      completedCoursesCount,
      activeAssignmentsCount,
      overdueAssignmentsCount
    }
  };
};

const ensureRoleBelongsToCompany = async (companyId, roleId) => {
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      companyId
    }
  });

  if (!role) {
    throw badRequest("Роль должна принадлежать этой же компании");
  }

  return role;
};

const ensureDepartmentBelongsToCompany = async (companyId, departmentId) => {
  if (!departmentId) {
    return null;
  }

  const department = await prisma.department.findFirst({
    where: {
      id: departmentId,
      companyId
    }
  });

  if (!department) {
    throw badRequest("Отдел должен принадлежать этой же компании");
  }

  return department;
};

const ensureUserBelongsToCompany = async (companyId, userId) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      companyId
    },
    include: userInclude
  });

  if (!user) {
    throw notFound("Пользователь не найден");
  }

  return user;
};

export async function listUsers(companyId) {
  const users = await prisma.user.findMany({
    where: { companyId },
    include: userInclude,
    orderBy: {
      createdAt: "desc"
    }
  });

  return users.map(serializeUser);
}

export async function getUserDetails(companyId, userId) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      companyId
    },
    include: userDetailInclude
  });

  if (!user) {
    throw notFound("Пользователь не найден");
  }

  return serializeUserDetails(user);
}

export async function createUser(companyId, payload, currentUserId = null) {
  await ensureRoleBelongsToCompany(companyId, payload.roleId);
  await ensureDepartmentBelongsToCompany(companyId, payload.departmentId);

  const existingUser = await prisma.user.findFirst({
    where: {
      companyId,
      email: payload.email
    }
  });

  if (existingUser) {
    throw badRequest("Этот адрес электронной почты уже используется");
  }

  const generatedPassword =
    payload.password ?? `${crypto.randomBytes(9).toString("base64url")}A1!`;
  const isInvite = payload.sendInvite || !payload.password;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: payload.name,
      email: payload.email,
      passwordHash: await hashPassword(generatedPassword),
      roleId: payload.roleId,
      departmentId: payload.departmentId === undefined ? null : payload.departmentId,
      position: payload.position ?? null,
      status: isInvite ? "invited" : payload.status ?? "active"
    },
    include: userInclude
  });

  const invitation = isInvite
    ? await createInvitationForUser({
        companyId,
        userId: user.id,
        createdById: currentUserId,
        temporaryPassword: generatedPassword
      })
    : null;

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "user.created",
    entityType: "user",
    entityId: user.id,
    metadata: {
      email: user.email,
      roleId: user.roleId,
      departmentId: user.departmentId,
      invited: isInvite
    }
  });

  return {
    user: serializeUser(user),
    invitePassword: isInvite ? generatedPassword : undefined,
    invitation
  };
}

export async function updateUser(companyId, userId, payload, currentUserId = null) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      companyId
    }
  });

  if (!user) {
    throw notFound("Пользователь не найден");
  }

  if (payload.roleId) {
    await ensureRoleBelongsToCompany(companyId, payload.roleId);
  }

  if (payload.departmentId !== undefined) {
    await ensureDepartmentBelongsToCompany(companyId, payload.departmentId);
  }

  if (payload.email && payload.email !== user.email) {
    const duplicate = await prisma.user.findFirst({
      where: {
        companyId,
        email: payload.email,
        NOT: {
          id: userId
        }
      }
    });

    if (duplicate) {
      throw badRequest("Этот адрес электронной почты уже используется");
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: payload.name ?? undefined,
      email: payload.email ?? undefined,
      passwordHash: payload.password ? await hashPassword(payload.password) : undefined,
      roleId: payload.roleId ?? undefined,
      departmentId: payload.departmentId === undefined ? undefined : payload.departmentId,
      position: payload.position === undefined ? undefined : payload.position,
      status: payload.status ?? undefined
    },
    include: userInclude
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "user.updated",
    entityType: "user",
    entityId: updatedUser.id,
    metadata: {
      changedFields: Object.keys(payload)
    }
  });

  return serializeUser(updatedUser);
}

export async function assignCoursesToUser(companyId, userId, payload, currentUserId) {
  const user = await ensureUserBelongsToCompany(companyId, userId);
  const uniqueCourseIds = [...new Set(payload.courseIds)];
  const courses = await prisma.course.findMany({
    where: {
      companyId,
      id: {
        in: uniqueCourseIds
      }
    },
    select: {
      id: true,
      title: true
    }
  });

  if (courses.length !== uniqueCourseIds.length) {
    throw badRequest("Все выбранные курсы должны принадлежать вашей компании");
  }

  const existingAssignments = await prisma.courseAssignment.findMany({
    where: {
      userId,
      courseId: {
        in: uniqueCourseIds
      }
    },
    select: {
      courseId: true
    }
  });

  const existingCourseIds = new Set(existingAssignments.map((assignment) => assignment.courseId));
  const assignmentsToCreate = uniqueCourseIds
    .filter((courseId) => !existingCourseIds.has(courseId))
    .map((courseId) => ({
      courseId,
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
      recipients: [userId],
      title:
        assignmentsToCreate.length === 1
          ? `Вам назначен курс «${courses.find((course) => course.id === assignmentsToCreate[0].courseId)?.title}»`
          : `Вам назначено ${assignmentsToCreate.length} новых курсов`,
      body: "Откройте раздел курсов, чтобы посмотреть программу обучения и дедлайны.",
      category: "course_assignment",
      metadata: {
        userId,
        courseIds: assignmentsToCreate.map((assignment) => assignment.courseId)
      }
    });

    emitToUser(userId, "courses:changed", {
      type: "assigned",
      courseIds: assignmentsToCreate.map((assignment) => assignment.courseId)
    });
  }

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "user.assignment_added",
    entityType: "user",
    entityId: userId,
    metadata: {
      courseIds: uniqueCourseIds,
      createdCount: assignmentsToCreate.length,
      skippedCount: existingAssignments.length
    }
  });

  return {
    createdCount: assignmentsToCreate.length,
    skippedCount: existingAssignments.length
  };
}

export async function updateUserAssignment(
  companyId,
  userId,
  assignmentId,
  payload,
  currentUserId
) {
  await ensureUserBelongsToCompany(companyId, userId);

  const assignment = await prisma.courseAssignment.findFirst({
    where: {
      id: assignmentId,
      userId,
      course: {
        companyId
      }
    },
    include: {
      course: {
        select: {
          id: true,
          title: true
        }
      }
    }
  });

  if (!assignment) {
    throw notFound("Назначение курса не найдено");
  }

  const updatedAssignment = await prisma.courseAssignment.update({
    where: {
      id: assignmentId
    },
    data: {
      deadline: payload.deadline ? new Date(payload.deadline) : null
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "user.assignment_updated",
    entityType: "course_assignment",
    entityId: assignmentId,
    metadata: {
      userId,
      courseId: assignment.course.id,
      deadline: updatedAssignment.deadline
    }
  });

  emitToUser(userId, "courses:changed", {
    type: "deadline_updated",
    courseId: assignment.course.id
  });

  return {
    id: updatedAssignment.id,
    deadline: updatedAssignment.deadline
  };
}

export async function removeUserAssignment(companyId, userId, assignmentId, currentUserId) {
  await ensureUserBelongsToCompany(companyId, userId);

  const assignment = await prisma.courseAssignment.findFirst({
    where: {
      id: assignmentId,
      userId,
      course: {
        companyId
      }
    },
    include: {
      course: {
        select: {
          id: true,
          title: true
        }
      }
    }
  });

  if (!assignment) {
    throw notFound("Назначение курса не найдено");
  }

  await prisma.courseAssignment.delete({
    where: {
      id: assignmentId
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "user.assignment_removed",
    entityType: "course_assignment",
    entityId: assignmentId,
    metadata: {
      userId,
      courseId: assignment.course.id
    }
  });

  emitToUser(userId, "courses:changed", {
    type: "removed",
    courseId: assignment.course.id
  });

  return {
    deleted: true
  };
}

export async function resetUserPassword(companyId, userId, currentUserId) {
  const user = await ensureUserBelongsToCompany(companyId, userId);
  const temporaryPassword = `${crypto.randomBytes(9).toString("base64url")}A1!`;

  await prisma.user.update({
    where: {
      id: userId
    },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      status: user.status === "invited" ? "active" : user.status
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "user.password_reset",
    entityType: "user",
    entityId: userId,
    metadata: {
      email: user.email
    }
  });

  return {
    userId,
    temporaryPassword
  };
}

export async function resendUserInvitation(companyId, userId, currentUserId = null) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      companyId
    },
    include: userInclude
  });

  if (!user) {
    throw notFound("Пользователь не найден");
  }

  const invitation = await resendInvitationEmail(companyId, userId, currentUserId);
  const refreshedUser = await prisma.user.findUnique({
    where: {
      id: userId
    },
    include: userInclude
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "user.invitation_resent",
    entityType: "user",
    entityId: userId,
    metadata: {
      email: user.email
    }
  });

  return {
    message: "Приглашение поставлено в очередь на отправку",
    user: serializeUser(refreshedUser ?? user),
    invitation
  };
}

export async function deleteUser(companyId, userId, currentUserId) {
  if (userId === currentUserId) {
    throw badRequest("Нельзя удалить собственную учетную запись");
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      companyId
    },
    include: {
      _count: {
        select: {
          createdCourses: true,
          managedDepartments: true,
          receivedAssignments: true,
          givenAssignments: true,
          progressRecords: true,
          certificates: true
        }
      }
    }
  });

  if (!user) {
    throw notFound("Пользователь не найден");
  }

  const hasLinkedData = Object.values(user._count).some((value) => value > 0);

  if (hasLinkedData) {
    const blockedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: "blocked"
      },
      include: userInclude
    });

    await recordAuditEvent({
      companyId,
      actorId: currentUserId,
      action: "user.blocked",
      entityType: "user",
      entityId: userId,
      metadata: {
        reason: "linked_data"
      }
    });

    return {
      deleted: false,
      message:
        "У пользователя есть связанные данные, поэтому аккаунт был заблокирован вместо удаления.",
      user: serializeUser(blockedUser)
    };
  }

  await prisma.user.delete({
    where: { id: userId }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "user.deleted",
    entityType: "user",
    entityId: userId
  });

  return {
    deleted: true,
    message: "Пользователь удален"
  };
}

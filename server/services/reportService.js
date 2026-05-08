import prisma from "../database/prisma.js";

function getProgressDataset(courses, assignments, progressRows) {
  const lessonCountByCourse = new Map(
    courses.map((course) => [
      course.id,
      course.modules.reduce((total, module) => total + module.lessons.length, 0)
    ])
  );

  const completedByUserCourse = progressRows.reduce((accumulator, row) => {
    const key = `${row.userId}:${row.lesson.module.courseId}`;
    const currentSet = accumulator.get(key) ?? new Set();
    currentSet.add(row.lessonId);
    accumulator.set(key, currentSet);
    return accumulator;
  }, new Map());

  return assignments.map((assignment) => {
    const totalLessons = lessonCountByCourse.get(assignment.courseId) ?? 0;
    const completedLessons =
      completedByUserCourse.get(`${assignment.userId}:${assignment.courseId}`)?.size ?? 0;
    const progressPercent = totalLessons
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;
    const overdue =
      Boolean(assignment.deadline) &&
      new Date(assignment.deadline) < new Date() &&
      progressPercent < 100;

    return {
      assignmentId: assignment.id,
      courseId: assignment.courseId,
      courseTitle: assignment.course.title,
      userId: assignment.userId,
      userName: assignment.user.name,
      userEmail: assignment.user.email,
      userStatus: assignment.user.status,
      departmentId: assignment.user.departmentId ?? 0,
      departmentName: assignment.user.department?.name ?? "Без отдела",
      assignedAt: assignment.assignedAt,
      deadline: assignment.deadline,
      totalLessons,
      completedLessons,
      progressPercent,
      overdue
    };
  });
}

async function getAnalyticsBase(companyId) {
  const [users, departments, courses, assignments, progressRows] = await Promise.all([
    prisma.user.findMany({
      where: {
        companyId
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        departmentId: true,
        department: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.department.findMany({
      where: {
        companyId
      },
      select: {
        id: true,
        name: true
      }
    }),
    prisma.course.findMany({
      where: {
        companyId
      },
      select: {
        id: true,
        title: true,
        status: true,
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
    }),
    prisma.courseAssignment.findMany({
      where: {
        course: {
          companyId
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            departmentId: true,
            department: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        course: {
          select: {
            id: true,
            title: true
          }
        }
      }
    }),
    prisma.progress.findMany({
      where: {
        completed: true,
        user: {
          companyId
        },
        lesson: {
          module: {
            course: {
              companyId
            }
          }
        }
      },
      select: {
        userId: true,
        lessonId: true,
        lesson: {
          select: {
            module: {
              select: {
                courseId: true
              }
            }
          }
        }
      }
    })
  ]);

  const assignmentProgress = getProgressDataset(courses, assignments, progressRows);

  return {
    users,
    departments,
    courses,
    assignments,
    assignmentProgress
  };
}

function buildSummarySnapshot(baseData) {
  const usersByStatus = baseData.users.reduce((accumulator, user) => {
    accumulator[user.status] = (accumulator[user.status] ?? 0) + 1;
    return accumulator;
  }, {});

  const coursesByStatus = baseData.courses.reduce((accumulator, course) => {
    accumulator[course.status] = (accumulator[course.status] ?? 0) + 1;
    return accumulator;
  }, {});

  const departmentLookup = new Map(
    baseData.departments.map((department) => [
      department.id,
      {
        id: department.id,
        name: department.name,
        assignmentCount: 0,
        totalPercentage: 0
      }
    ])
  );

  const courseLookup = new Map(
    baseData.courses.map((course) => [
      course.id,
      {
        id: course.id,
        title: course.title,
        assignmentCount: 0,
        totalPercentage: 0
      }
    ])
  );

  let overdueAssignments = 0;

  baseData.assignmentProgress.forEach((item) => {
    if (item.overdue) {
      overdueAssignments += 1;
    }

    if (!departmentLookup.has(item.departmentId)) {
      departmentLookup.set(item.departmentId, {
        id: item.departmentId,
        name: item.departmentName,
        assignmentCount: 0,
        totalPercentage: 0
      });
    }

    const departmentStat = departmentLookup.get(item.departmentId);
    departmentStat.assignmentCount += 1;
    departmentStat.totalPercentage += item.progressPercent;

    const courseStat = courseLookup.get(item.courseId);
    if (courseStat) {
      courseStat.assignmentCount += 1;
      courseStat.totalPercentage += item.progressPercent;
    }
  });

  return {
    usersByStatus,
    coursesByStatus,
    overdueAssignments,
    completionByDepartment: [...departmentLookup.values()]
      .filter((department) => department.assignmentCount > 0)
      .map((department) => ({
        id: department.id,
        name: department.name,
        assignmentCount: department.assignmentCount,
        averageCompletion: Math.round(
          department.totalPercentage / department.assignmentCount
        )
      }))
      .sort((left, right) => right.averageCompletion - left.averageCompletion),
    topCourses: [...courseLookup.values()]
      .filter((course) => course.assignmentCount > 0)
      .map((course) => ({
        id: course.id,
        title: course.title,
        assignmentCount: course.assignmentCount,
        averageCompletion: Math.round(course.totalPercentage / course.assignmentCount)
      }))
      .sort((left, right) => right.averageCompletion - left.averageCompletion)
      .slice(0, 5)
  };
}

function buildCourseProgress(baseData) {
  const lessonCountByCourse = new Map(
    baseData.courses.map((course) => [
      course.id,
      course.modules.reduce((total, module) => total + module.lessons.length, 0)
    ])
  );

  const courseMap = new Map(
    baseData.courses.map((course) => [
      course.id,
      {
        id: course.id,
        title: course.title,
        status: course.status,
        lessonsCount: lessonCountByCourse.get(course.id) ?? 0,
        assignmentCount: 0,
        totalCompletion: 0,
        overdueAssignments: 0
      }
    ])
  );

  baseData.assignmentProgress.forEach((item) => {
    const currentCourse = courseMap.get(item.courseId);
    if (!currentCourse) {
      return;
    }

    currentCourse.assignmentCount += 1;
    currentCourse.totalCompletion += item.progressPercent;

    if (item.overdue) {
      currentCourse.overdueAssignments += 1;
    }
  });

  return [...courseMap.values()]
    .map((course) => ({
      ...course,
      averageCompletion: course.assignmentCount
        ? Math.round(course.totalCompletion / course.assignmentCount)
        : 0
    }))
    .sort((left, right) => {
      if (right.assignmentCount !== left.assignmentCount) {
        return right.assignmentCount - left.assignmentCount;
      }

      return right.averageCompletion - left.averageCompletion;
    });
}

function buildUserProgress(baseData) {
  return [...baseData.assignmentProgress]
    .sort((left, right) => {
      if (left.overdue !== right.overdue) {
        return Number(right.overdue) - Number(left.overdue);
      }

      return right.progressPercent - left.progressPercent;
    })
    .map((item) => ({
      userId: item.userId,
      userName: item.userName,
      userEmail: item.userEmail,
      userStatus: item.userStatus,
      departmentName: item.departmentName,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      progressPercent: item.progressPercent,
      completedLessons: item.completedLessons,
      totalLessons: item.totalLessons,
      assignedAt: item.assignedAt,
      deadline: item.deadline,
      overdue: item.overdue
    }));
}

export async function getReportSummary(companyId) {
  const baseData = await getAnalyticsBase(companyId);
  return buildSummarySnapshot(baseData);
}

export async function getDetailedReport(companyId) {
  const baseData = await getAnalyticsBase(companyId);

  return {
    summary: buildSummarySnapshot(baseData),
    courses: buildCourseProgress(baseData),
    users: buildUserProgress(baseData)
  };
}

import prisma from "../database/prisma.js";
import { serializeCertificate } from "./certificateService.js";
import { listThreads } from "./chatService.js";
import { listMyCourses } from "./courseService.js";
import { getReportSummary } from "./reportService.js";

export async function getDashboardOverview(currentUser) {
  const myCourses = await listMyCourses(currentUser.companyId, currentUser);

  const [certificatesCount, recentCertificates] = await Promise.all([
    prisma.certificate.count({
      where: {
        userId: currentUser.id
      }
    }),
    prisma.certificate.findMany({
      where: {
        userId: currentUser.id
      },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        }
      },
      orderBy: {
        issuedAt: "desc"
      },
      take: 5
    })
  ]);

  const chatThreads = await listThreads(currentUser.companyId, currentUser);
  const recentThreads = chatThreads.slice(0, 3);

  const overview = {
    summary: {
      assignedCourses: myCourses.length,
      completedCourses: myCourses.filter((course) => course.progressPercent === 100)
        .length,
      inProgressCourses: myCourses.filter(
        (course) => course.progressPercent > 0 && course.progressPercent < 100
      ).length,
      certificates: certificatesCount,
      unreadThreads: chatThreads.filter((thread) => thread.unreadCount > 0).length
    },
    myCourses: myCourses.slice(0, 6),
    communication: {
      unreadThreads: chatThreads.filter((thread) => thread.unreadCount > 0).length,
      openThreads: chatThreads.filter((thread) => thread.status === "open").length,
      waitingReply: chatThreads.filter(
        (thread) =>
          thread.status === "open" &&
          thread.lastMessage &&
          thread.lastMessage.sender.id === currentUser.id
      ).length
    },
    recentThreads: recentThreads.map((thread) => ({
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      updatedAt: thread.updatedAt,
      lastMessageAt: thread.lastMessageAt,
      unreadCount: thread.unreadCount,
      counterparties: thread.counterparties,
      lastMessage: thread.lastMessage
    })),
    certificates: recentCertificates.map((certificate) => ({
      ...serializeCertificate(certificate),
      course: certificate.course
    }))
  };

  if (currentUser.permissions?.manage_users || currentUser.permissions?.view_reports) {
    const [totalUsers, activeUsers, companyCourses, reportSummary] = await Promise.all([
      prisma.user.count({
        where: {
          companyId: currentUser.companyId
        }
      }),
      prisma.user.count({
        where: {
          companyId: currentUser.companyId,
          status: "active"
        }
      }),
      prisma.course.count({
        where: {
          companyId: currentUser.companyId
        }
      }),
      getReportSummary(currentUser.companyId)
    ]);

    overview.team = {
      totalUsers,
      activeUsers,
      companyCourses,
      overdueAssignments: reportSummary.overdueAssignments
    };
  }

  if (currentUser.permissions?.manage_roles) {
    const [rolesCount, departmentsCount] = await Promise.all([
      prisma.role.count({
        where: {
          companyId: currentUser.companyId
        }
      }),
      prisma.department.count({
        where: {
          companyId: currentUser.companyId
        }
      })
    ]);

    overview.hr = {
      rolesCount,
      departmentsCount
    };
  }

  return overview;
}

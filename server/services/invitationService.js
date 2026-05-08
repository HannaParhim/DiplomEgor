import crypto from "node:crypto";
import path from "node:path";
import prisma from "../database/prisma.js";
import config from "../config/index.js";
import { hashPassword } from "../utils/password.js";
import { appendJsonLine } from "../utils/storage.js";
import { enqueueBackgroundJob } from "./backgroundJobService.js";

export const INVITATION_EMAIL_JOB_TYPE = "invitation_email";

const createInvitationToken = () => crypto.randomBytes(24).toString("hex");

const serializeInvitation = (invitation) => ({
  id: invitation.id,
  token: invitation.token,
  status: invitation.status,
  expiresAt: invitation.expiresAt,
  sentAt: invitation.sentAt,
  acceptedAt: invitation.acceptedAt,
  user: invitation.user
    ? {
        id: invitation.user.id,
        name: invitation.user.name,
        email: invitation.user.email,
        status: invitation.user.status
      }
    : null
});

export async function createInvitationForUser({
  companyId,
  userId,
  createdById = null,
  temporaryPassword = null
}) {
  const invitation = await prisma.userInvitation.create({
    data: {
      companyId,
      userId,
      createdById,
      token: createInvitationToken(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true
        }
      }
    }
  });

  await enqueueBackgroundJob({
    companyId,
    createdById,
    type: INVITATION_EMAIL_JOB_TYPE,
    payload: {
      invitationId: invitation.id,
      temporaryPassword
    }
  });

  return serializeInvitation(invitation);
}

export async function resendInvitationEmail(companyId, userId, createdById = null) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      companyId
    }
  });

  if (!user) {
    return null;
  }

  const temporaryPassword = `${crypto.randomBytes(9).toString("base64url")}A1!`;

  await prisma.user.update({
    where: {
      id: userId
    },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      status: "invited"
    }
  });

  return createInvitationForUser({
    companyId,
    userId,
    createdById,
    temporaryPassword
  });
}

export async function markInvitationAccepted(userId) {
  await prisma.userInvitation.updateMany({
    where: {
      userId,
      status: {
        in: ["pending", "sent"]
      }
    },
    data: {
      status: "accepted",
      acceptedAt: new Date()
    }
  });
}

export async function processInvitationEmailJob(payload, job) {
  const invitation = await prisma.userInvitation.findUnique({
    where: {
      id: payload.invitationId
    },
    include: {
      company: true,
      user: true,
      creator: true
    }
  });

  if (!invitation) {
    throw new Error("Приглашение не найдено");
  }

  if (invitation.expiresAt < new Date()) {
    await prisma.userInvitation.update({
      where: {
        id: invitation.id
      },
      data: {
        status: "expired"
      }
    });

    return {
      skipped: true,
      reason: "expired"
    };
  }

  const inviteLink = `${config.clientUrl}/login?companyDomain=${invitation.company.domain ?? ""}&invite=${invitation.token}`;

  await appendJsonLine(path.join(config.logDir, "emails.log"), {
    jobId: job.id,
    sentAt: new Date().toISOString(),
    to: invitation.user.email,
    subject: `Приглашение в ${invitation.company.name}`,
    inviteLink,
    temporaryPassword: payload.temporaryPassword ?? null,
    company: invitation.company.name,
    createdBy: invitation.creator?.email ?? null
  });

  await prisma.userInvitation.update({
    where: {
      id: invitation.id
    },
    data: {
      status: "sent",
      sentAt: new Date()
    }
  });

  return {
    invitationId: invitation.id,
    inviteLink,
    to: invitation.user.email
  };
}

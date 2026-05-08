import prisma from "../database/prisma.js";
import { badRequest, notFound, unauthorized } from "../utils/errors.js";
import { signToken } from "../utils/jwt.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import {
  administratorPermissions,
  employeePermissions,
  hrPermissions,
  managerPermissions,
  parsePermissions,
  toPermissionJson
} from "../utils/permissions.js";
import { recordAuditEvent } from "./auditService.js";
import {
  canManageCompanySettings,
  serializeCompany
} from "./companySettingsService.js";
import { markInvitationAccepted } from "./invitationService.js";

const serializeUser = (user) => ({
  id: user.id,
  companyId: user.companyId,
  name: user.name,
  email: user.email,
  position: user.position,
  status: user.status,
  department: user.department
    ? {
        id: user.department.id,
        name: user.department.name
      }
    : null,
  role: user.role
    ? {
        id: user.role.id,
        name: user.role.name,
        permissions: parsePermissions(user.role.permissions)
      }
    : null
});

const canSeeCompanySettings = (user) =>
  canManageCompanySettings(parsePermissions(user?.role?.permissions));

const buildAuthResponse = (user) => ({
  token: signToken({
    sub: user.id,
    companyId: user.companyId,
    roleId: user.roleId
  }),
  company: serializeCompany(user.company, {
    includeSensitive: canSeeCompanySettings(user)
  }),
  user: serializeUser(user)
});

export async function registerCompany({
  companyName,
  companyDomain,
  adminName,
  adminEmail,
  adminPassword
}) {
  const existingCompany = await prisma.company.findUnique({
    where: { domain: companyDomain }
  });

  if (existingCompany) {
    throw badRequest("Домен компании уже занят");
  }

  const existingAdmin = await prisma.user.findFirst({
    where: {
      email: adminEmail,
      company: {
        domain: companyDomain
      }
    }
  });

  if (existingAdmin) {
    throw badRequest("Почта администратора уже используется в этой компании");
  }

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: companyName,
        domain: companyDomain,
        directorName: adminName,
        directorTitle: "Генеральный директор"
      }
    });

    const [adminRole] = await Promise.all([
      tx.role.create({
        data: {
          companyId: company.id,
          name: "Администратор",
          permissions: toPermissionJson(administratorPermissions)
        }
      }),
      tx.role.create({
        data: {
          companyId: company.id,
          name: "Менеджер",
          permissions: toPermissionJson(managerPermissions)
        }
      }),
      tx.role.create({
        data: {
          companyId: company.id,
          name: "HR",
          permissions: toPermissionJson(hrPermissions)
        }
      }),
      tx.role.create({
        data: {
          companyId: company.id,
          name: "Сотрудник",
          permissions: toPermissionJson(employeePermissions)
        }
      })
    ]);

    const user = await tx.user.create({
      data: {
        companyId: company.id,
        name: adminName,
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        roleId: adminRole.id,
        status: "active"
      },
      include: {
        company: true,
        role: true,
        department: true
      }
    });

    return {
      response: buildAuthResponse(user),
      companyId: company.id,
      adminId: user.id
    };
  });

  await recordAuditEvent({
    companyId: result.companyId,
    actorId: result.adminId,
    action: "company.registered",
    entityType: "company",
    entityId: result.companyId,
    metadata: {
      adminEmail
    }
  });

  return result.response;
}

export async function login({ email, password, companyDomain }) {
  let user;

  if (companyDomain) {
    const company = await prisma.company.findUnique({
      where: { domain: companyDomain }
    });

    if (!company) {
      throw notFound("Компания не найдена");
    }

    user = await prisma.user.findFirst({
      where: {
        email,
        companyId: company.id
      },
      include: {
        company: true,
        role: true,
        department: true
      }
    });
  } else {
    const matchedUsers = await prisma.user.findMany({
      where: { email },
      include: {
        company: true,
        role: true,
        department: true
      }
    });

    if (matchedUsers.length > 1) {
      throw badRequest("Укажите домен компании, чтобы выбрать нужный аккаунт");
    }

    user = matchedUsers[0];
  }

  if (!user) {
    throw unauthorized("Неверная почта или пароль");
  }

  if (user.status === "blocked") {
    throw unauthorized("Пользователь заблокирован");
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw unauthorized("Неверная почта или пароль");
  }

  let normalizedUser = user;

  if (user.status === "invited") {
    normalizedUser = await prisma.user.update({
      where: { id: user.id },
      data: { status: "active" },
      include: {
        company: true,
        role: true,
        department: true
      }
    });

    await markInvitationAccepted(user.id);
  }

  await recordAuditEvent({
    companyId: normalizedUser.companyId,
    actorId: normalizedUser.id,
    action: "auth.login",
    entityType: "user",
    entityId: normalizedUser.id,
    metadata: {
      email: normalizedUser.email
    }
  });

  return buildAuthResponse(normalizedUser);
}

export async function getCurrentUser(userId, companyId) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      companyId
    },
    include: {
      company: true,
      role: true,
      department: true
    }
  });

  if (!user) {
    throw notFound("Пользователь не найден");
  }

  return {
    company: serializeCompany(user.company, {
      includeSensitive: canSeeCompanySettings(user)
    }),
    user: serializeUser(user)
  };
}

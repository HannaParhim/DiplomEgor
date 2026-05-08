import prisma from "../database/prisma.js";
import { badRequest, notFound } from "../utils/errors.js";
import { parsePermissions, toPermissionJson } from "../utils/permissions.js";

const serializeRole = (role) => ({
  id: role.id,
  companyId: role.companyId,
  name: role.name,
  createdAt: role.createdAt,
  permissions: parsePermissions(role.permissions),
  usersCount: role._count?.users ?? undefined
});

export async function listRoles(companyId) {
  const roles = await prisma.role.findMany({
    where: { companyId },
    include: {
      _count: {
        select: {
          users: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return roles.map(serializeRole);
}

export async function createRole(companyId, payload) {
  const existingRole = await prisma.role.findFirst({
    where: {
      companyId,
      name: payload.name
    }
  });

  if (existingRole) {
    throw badRequest("Роль с таким названием уже существует");
  }

  const role = await prisma.role.create({
    data: {
      companyId,
      name: payload.name,
      permissions: toPermissionJson(payload.permissions)
    }
  });

  return serializeRole(role);
}

export async function updateRole(companyId, roleId, payload) {
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      companyId
    }
  });

  if (!role) {
    throw notFound("Роль не найдена");
  }

  if (payload.name && payload.name !== role.name) {
    const duplicate = await prisma.role.findFirst({
      where: {
        companyId,
        name: payload.name,
        NOT: {
          id: roleId
        }
      }
    });

    if (duplicate) {
      throw badRequest("Роль с таким названием уже существует");
    }
  }

  const updatedRole = await prisma.role.update({
    where: { id: roleId },
    data: {
      name: payload.name ?? undefined,
      permissions:
        payload.permissions === undefined
          ? undefined
          : toPermissionJson(payload.permissions)
    },
    include: {
      _count: {
        select: {
          users: true
        }
      }
    }
  });

  return serializeRole(updatedRole);
}

export async function deleteRole(companyId, roleId) {
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      companyId
    },
    include: {
      _count: {
        select: {
          users: true
        }
      }
    }
  });

  if (!role) {
    throw notFound("Роль не найдена");
  }

  if (role._count.users > 0) {
    throw badRequest("Роль назначена пользователям и не может быть удалена");
  }

  await prisma.role.delete({
    where: { id: roleId }
  });

  return { deleted: true };
}

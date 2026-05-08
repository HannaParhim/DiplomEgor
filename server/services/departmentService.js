import prisma from "../database/prisma.js";
import { badRequest, notFound } from "../utils/errors.js";

const serializeDepartment = (department) => ({
  id: department.id,
  companyId: department.companyId,
  name: department.name,
  manager: department.manager
    ? {
        id: department.manager.id,
        name: department.manager.name,
        email: department.manager.email
      }
    : null,
  membersCount: department._count?.members ?? 0
});

const ensureManagerBelongsToCompany = async (companyId, managerId) => {
  if (!managerId) {
    return null;
  }

  const manager = await prisma.user.findFirst({
    where: {
      id: managerId,
      companyId
    }
  });

  if (!manager) {
    throw badRequest("Руководитель должен принадлежать этой же компании");
  }

  return manager;
};

export async function listDepartments(companyId) {
  const departments = await prisma.department.findMany({
    where: { companyId },
    include: {
      manager: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      _count: {
        select: {
          members: true
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });

  return departments.map(serializeDepartment);
}

export async function createDepartment(companyId, payload) {
  const existingDepartment = await prisma.department.findFirst({
    where: {
      companyId,
      name: payload.name
    }
  });

  if (existingDepartment) {
    throw badRequest("Отдел с таким названием уже существует");
  }

  await ensureManagerBelongsToCompany(companyId, payload.managerId);

  const department = await prisma.department.create({
    data: {
      companyId,
      name: payload.name,
      managerId: payload.managerId ?? null
    },
    include: {
      manager: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      _count: {
        select: {
          members: true
        }
      }
    }
  });

  return serializeDepartment(department);
}

export async function updateDepartment(companyId, departmentId, payload) {
  const department = await prisma.department.findFirst({
    where: {
      id: departmentId,
      companyId
    }
  });

  if (!department) {
    throw notFound("Отдел не найден");
  }

  if (payload.name && payload.name !== department.name) {
    const duplicate = await prisma.department.findFirst({
      where: {
        companyId,
        name: payload.name,
        NOT: {
          id: departmentId
        }
      }
    });

    if (duplicate) {
      throw badRequest("Отдел с таким названием уже существует");
    }
  }

  await ensureManagerBelongsToCompany(companyId, payload.managerId);

  const updatedDepartment = await prisma.department.update({
    where: { id: departmentId },
    data: {
      name: payload.name ?? undefined,
      managerId:
        payload.managerId === undefined ? undefined : payload.managerId
    },
    include: {
      manager: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      _count: {
        select: {
          members: true
        }
      }
    }
  });

  return serializeDepartment(updatedDepartment);
}

export async function deleteDepartment(companyId, departmentId) {
  const department = await prisma.department.findFirst({
    where: {
      id: departmentId,
      companyId
    }
  });

  if (!department) {
    throw notFound("Отдел не найден");
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: {
        companyId,
        departmentId
      },
      data: {
        departmentId: null
      }
    }),
    prisma.department.delete({
      where: { id: departmentId }
    })
  ]);

  return { deleted: true };
}

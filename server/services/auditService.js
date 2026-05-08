import prisma from "../database/prisma.js";

const safeStringify = (value) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
};

const safeParse = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

const serializeAuditLog = (entry) => ({
  id: entry.id,
  action: entry.action,
  entityType: entry.entityType,
  entityId: entry.entityId,
  metadata: safeParse(entry.metadata),
  createdAt: entry.createdAt,
  actor: entry.actor
    ? {
        id: entry.actor.id,
        name: entry.actor.name,
        email: entry.actor.email
      }
    : null
});

export async function recordAuditEvent({
  companyId,
  actorId = null,
  action,
  entityType,
  entityId = null,
  metadata = {}
}) {
  if (!companyId || !action || !entityType) {
    return null;
  }

  return prisma.auditLog.create({
    data: {
      companyId,
      actorId,
      action,
      entityType,
      entityId: entityId === null || entityId === undefined ? null : String(entityId),
      metadata: safeStringify(metadata)
    }
  });
}

export async function listAuditLogs(
  companyId,
  { limit = 50, action, entityType, actorId } = {}
) {
  const entries = await prisma.auditLog.findMany({
    where: {
      companyId,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorId ? { actorId } : {})
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: Math.min(Math.max(Number(limit) || 50, 1), 200)
  });

  return entries.map(serializeAuditLog);
}

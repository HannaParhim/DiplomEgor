import prisma from "../database/prisma.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { parsePermissions } from "../utils/permissions.js";
import { recordAuditEvent } from "./auditService.js";
import { queueNotification } from "./notificationService.js";
import { emitToUsers } from "./realtimeService.js";

const CHAT_OPERATOR_PERMISSIONS = [
  "manage_users",
  "manage_departments",
  "manage_roles",
  "assign_courses",
  "view_reports",
  "create_courses",
  "edit_courses",
  "delete_courses",
  "chat_manage_thread_settings",
  "chat_close_threads",
  "chat_assign_threads"
];

const CHAT_ACTIVITY_ACTIONS = [
  "chat.thread_created",
  "chat.thread_assignee_changed",
  "chat.thread_status_changed",
  "chat.thread_settings_changed"
];

const participantInclude = {
  user: {
    include: {
      role: true,
      department: true
    }
  }
};

const messageInclude = {
  sender: {
    include: {
      role: true,
      department: true
    }
  }
};

const threadListInclude = {
  creator: {
    include: {
      role: true,
      department: true
    }
  },
  assignee: {
    include: {
      role: true,
      department: true
    }
  },
  participants: {
    include: participantInclude
  },
  messages: {
    orderBy: {
      createdAt: "desc"
    },
    take: 1,
    include: messageInclude
  }
};

const threadDetailInclude = {
  creator: {
    include: {
      role: true,
      department: true
    }
  },
  assignee: {
    include: {
      role: true,
      department: true
    }
  },
  participants: {
    include: participantInclude
  },
  messages: {
    orderBy: {
      createdAt: "asc"
    },
    include: messageInclude
  }
};

const getUserPermissions = (user) =>
  parsePermissions(user?.role?.permissions ?? user?.permissions ?? {});

const isManagementUser = (user) =>
  CHAT_OPERATOR_PERMISSIONS.some((permission) => getUserPermissions(user)[permission]);

const canUploadAttachments = (user) =>
  Boolean(getUserPermissions(user).chat_upload_attachments);

const canManageThreadSettings = (user) =>
  Boolean(getUserPermissions(user).chat_manage_thread_settings);

const canCloseThreads = (user) => Boolean(getUserPermissions(user).chat_close_threads);

const canAssignThreads = (user) => Boolean(getUserPermissions(user).chat_assign_threads);

const parseMetadata = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

const serializeActorSummary = (actor) =>
  actor
    ? {
        id: actor.id,
        name: actor.name,
        email: actor.email
      }
    : null;

const serializeRoleSummary = (role) =>
  role
    ? {
        id: role.id,
        name: role.name,
        permissions: parsePermissions(role.permissions)
      }
    : null;

const serializeDepartmentSummary = (department) =>
  department
    ? {
        id: department.id,
        name: department.name
      }
    : null;

const serializeUserSummary = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  position: user.position ?? null,
  role: serializeRoleSummary(user.role),
  department: serializeDepartmentSummary(user.department)
});

const createUserSnapshot = (user) =>
  user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        position: user.position ?? null,
        role: user.role
          ? {
              id: user.role.id,
              name: user.role.name
            }
          : null,
        department: user.department
          ? {
              id: user.department.id,
              name: user.department.name
            }
          : null
      }
    : null;

const findParticipantRecord = (thread, userId) =>
  thread.participants.find((participant) => participant.userId === userId);

const serializeMessage = (message) => ({
  id: message.id,
  content: message.content,
  attachmentUrl: message.attachmentUrl,
  createdAt: message.createdAt,
  sender: serializeUserSummary(message.sender)
});

const getLatestMessage = (thread) =>
  thread.messages?.length ? thread.messages[thread.messages.length - 1] : null;

const serializeThreadBase = (thread, currentUserId, unreadCount = 0) => {
  const selfParticipant = findParticipantRecord(thread, currentUserId);
  const otherParticipants = thread.participants
    .filter((participant) => participant.userId !== currentUserId)
    .map((participant) => serializeUserSummary(participant.user));
  const latestMessage = getLatestMessage(thread);
  const lastMessageDirection = !latestMessage
    ? "none"
    : latestMessage.sender.id === currentUserId
      ? "outgoing"
      : "incoming";

  return {
    id: thread.id,
    subject: thread.subject,
    category: thread.category,
    status: thread.status,
    createdAt: thread.createdAt,
    lastMessageAt: thread.lastMessageAt,
    updatedAt: thread.updatedAt,
    isArchived: thread.status === "closed",
    unreadCount,
    creator: serializeUserSummary(thread.creator),
    assignee: thread.assignee ? serializeUserSummary(thread.assignee) : null,
    participants: thread.participants.map((participant) => ({
      id: participant.id,
      userId: participant.userId,
      lastReadAt: participant.lastReadAt,
      user: serializeUserSummary(participant.user)
    })),
    counterparties: otherParticipants,
    lastMessageDirection,
    needsReplyFromCurrentUser:
      thread.status === "open" && lastMessageDirection === "incoming",
    waitingForOtherSide:
      thread.status === "open" && lastMessageDirection === "outgoing",
    lastMessagePreview:
      latestMessage?.content ||
      (latestMessage?.attachmentUrl ? "Вложение без текста" : ""),
    myParticipant: selfParticipant
      ? {
          id: selfParticipant.id,
          lastReadAt: selfParticipant.lastReadAt
        }
      : null
  };
};

const serializeThreadListItem = (thread, currentUserId, unreadCount) => ({
  ...serializeThreadBase(thread, currentUserId, unreadCount),
  lastMessage: thread.messages[0] ? serializeMessage(thread.messages[0]) : null
});

const serializeThreadActivity = (entry) => ({
  id: entry.id,
  action: entry.action,
  createdAt: entry.createdAt,
  actor: serializeActorSummary(entry.actor),
  metadata: parseMetadata(entry.metadata)
});

const buildThreadCurrentState = (thread, activityEntries) => {
  const chronologicalEntries = [...activityEntries].reverse();
  const activeStatusEvent = chronologicalEntries
    .filter((entry) => entry.action === "chat.thread_status_changed")
    .find((entry) => entry.metadata?.nextStatus === thread.status);

  const activeAssigneeEvent = chronologicalEntries
    .filter(
      (entry) =>
        entry.action === "chat.thread_assignee_changed" &&
        (entry.metadata?.nextAssignee?.id ?? null) === (thread.assignee?.id ?? null)
    )
    .at(-1);

  const createdAssignmentEvent =
    thread.assignee &&
    !activeAssigneeEvent &&
    chronologicalEntries.find(
      (entry) =>
        entry.action === "chat.thread_created" &&
        (entry.metadata?.assignedTo?.id ?? null) === thread.assignee.id
    );

  const currentAssignmentEvent = activeAssigneeEvent ?? createdAssignmentEvent ?? null;

  return {
    subject: thread.subject,
    category: thread.category,
    status: thread.status,
    createdAt: thread.createdAt,
    createdBy: serializeUserSummary(thread.creator),
    lastMessageAt: thread.lastMessageAt,
    assignee: thread.assignee ? serializeUserSummary(thread.assignee) : null,
    assignedAt: thread.assignee ? currentAssignmentEvent?.createdAt ?? thread.createdAt : null,
    assignedBy: thread.assignee
      ? currentAssignmentEvent?.actor ?? serializeUserSummary(thread.creator)
      : null,
    statusChangedAt: activeStatusEvent?.createdAt ?? null,
    statusChangedBy: activeStatusEvent?.actor ?? null,
    closedAt:
      thread.status === "closed" && activeStatusEvent?.metadata?.nextStatus === "closed"
        ? activeStatusEvent.createdAt
        : null,
    closedBy:
      thread.status === "closed" && activeStatusEvent?.metadata?.nextStatus === "closed"
        ? activeStatusEvent.actor
        : null
  };
};

const serializeThreadDetail = (thread, currentUserId, unreadCount, activityEntries) => ({
  ...serializeThreadBase(thread, currentUserId, unreadCount),
  messages: thread.messages.map(serializeMessage),
  activity: activityEntries,
  currentState: buildThreadCurrentState(thread, activityEntries)
});

const ensureUserBelongsToCompany = async (companyId, userId) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      companyId,
      status: {
        in: ["active", "invited"]
      }
    },
    include: {
      role: true,
      department: true
    }
  });

  if (!user) {
    throw badRequest("Пользователь должен принадлежать вашей компании и быть активным");
  }

  return user;
};

const ensureThreadAccessible = async (companyId, threadId, userId) => {
  const thread = await prisma.chatThread.findFirst({
    where: {
      id: threadId,
      companyId,
      participants: {
        some: {
          userId
        }
      }
    },
    include: threadDetailInclude
  });

  if (!thread) {
    throw notFound("Диалог не найден");
  }

  return thread;
};

const countUnreadMessages = async (threadId, userId, lastReadAt) =>
  prisma.chatMessage.count({
    where: {
      threadId,
      senderId: {
        not: userId
      },
      ...(lastReadAt
        ? {
            createdAt: {
              gt: lastReadAt
            }
          }
        : {})
    }
  });

const ensureAttachmentPermission = (currentUser, attachmentUrl) => {
  if (attachmentUrl && !canUploadAttachments(currentUser)) {
    throw forbidden("Недостаточно прав для отправки вложений в чат");
  }
};

const listThreadActivity = async (companyId, threadId) => {
  const entries = await prisma.auditLog.findMany({
    where: {
      companyId,
      entityType: "chat_thread",
      entityId: String(threadId),
      action: {
        in: CHAT_ACTIVITY_ACTIONS
      }
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
    take: 100
  });

  return entries.map(serializeThreadActivity);
};

export async function listChatContacts(companyId, currentUser) {
  const users = await prisma.user.findMany({
    where: {
      companyId,
      id: {
        not: currentUser.id
      },
      status: "active"
    },
    include: {
      role: true,
      department: true
    },
    orderBy: [
      {
        name: "asc"
      }
    ]
  });

  const currentUserIsManagement = isManagementUser(currentUser);
  const visibleContacts = currentUserIsManagement
    ? users
    : users.filter((user) => isManagementUser(user));

  return visibleContacts.map((user) => ({
    ...serializeUserSummary(user),
    isManagement: isManagementUser(user)
  }));
}

export async function listThreads(companyId, currentUser) {
  const threads = await prisma.chatThread.findMany({
    where: {
      companyId,
      participants: {
        some: {
          userId: currentUser.id
        }
      }
    },
    include: threadListInclude,
    orderBy: [
      {
        status: "asc"
      },
      {
        lastMessageAt: "desc"
      }
    ]
  });

  const unreadCounts = await Promise.all(
    threads.map((thread) =>
      countUnreadMessages(
        thread.id,
        currentUser.id,
        findParticipantRecord(thread, currentUser.id)?.lastReadAt ?? null
      )
    )
  );

  return threads.map((thread, index) =>
    serializeThreadListItem(thread, currentUser.id, unreadCounts[index])
  );
}

export async function getChatSummary(companyId, currentUser) {
  const threads = await listThreads(companyId, currentUser);

  return {
    unread: threads.reduce((total, thread) => total + thread.unreadCount, 0),
    open: threads.filter((thread) => thread.status === "open").length,
    closed: threads.filter((thread) => thread.status === "closed").length,
    needReply: threads.filter((thread) => thread.needsReplyFromCurrentUser).length,
    waiting: threads.filter((thread) => thread.waitingForOtherSide).length
  };
}

export async function getThreadById(companyId, threadId, currentUser) {
  const thread = await ensureThreadAccessible(companyId, threadId, currentUser.id);
  const unreadCount = await countUnreadMessages(
    thread.id,
    currentUser.id,
    findParticipantRecord(thread, currentUser.id)?.lastReadAt ?? null
  );
  const activityEntries = await listThreadActivity(companyId, thread.id);

  return serializeThreadDetail(thread, currentUser.id, unreadCount, activityEntries);
}

export async function createThread(companyId, currentUser, payload) {
  if (payload.recipientId === currentUser.id) {
    throw badRequest("Нельзя начать диалог с самим собой");
  }

  ensureAttachmentPermission(currentUser, payload.attachmentUrl);

  const recipient = await ensureUserBelongsToCompany(companyId, payload.recipientId);
  const currentUserIsManagement = isManagementUser(currentUser);

  if (!currentUserIsManagement && !isManagementUser(recipient)) {
    throw forbidden("Сотрудник может создавать обращения только руководителям и HR");
  }

  const thread = await prisma.$transaction(async (tx) => {
    const timestamp = new Date();
    const createdThread = await tx.chatThread.create({
      data: {
        companyId,
        subject: payload.subject,
        category: payload.category,
        createdById: currentUser.id,
        assignedToId: recipient.id,
        lastMessageAt: timestamp
      }
    });

    await tx.chatThreadParticipant.createMany({
      data: [
        {
          threadId: createdThread.id,
          userId: currentUser.id,
          lastReadAt: timestamp
        },
        {
          threadId: createdThread.id,
          userId: recipient.id,
          lastReadAt: null
        }
      ]
    });

    await tx.chatMessage.create({
      data: {
        threadId: createdThread.id,
        senderId: currentUser.id,
        content: payload.content?.trim() ?? "",
        attachmentUrl: payload.attachmentUrl ?? null
      }
    });

    return tx.chatThread.findUnique({
      where: {
        id: createdThread.id
      },
      include: threadDetailInclude
    });
  });

  await Promise.all([
    queueNotification({
      companyId,
      triggeredById: currentUser.id,
      recipients: [recipient.id],
      title: `Новое обращение: ${payload.subject}`,
      body: payload.content?.trim() || "В диалоге есть новое сообщение или вложение.",
      category: "chat_thread",
      metadata: {
        threadId: thread.id
      }
    }),
    recordAuditEvent({
      companyId,
      actorId: currentUser.id,
      action: "chat.thread_created",
      entityType: "chat_thread",
      entityId: thread.id,
      metadata: {
        subject: payload.subject,
        category: payload.category,
        assignedTo: createUserSnapshot(recipient),
        hasAttachment: Boolean(payload.attachmentUrl)
      }
    })
  ]);

  emitToUsers(
    thread.participants.map((participant) => participant.userId),
    "chat:changed",
    {
      type: "thread_created",
      threadId: thread.id
    }
  );

  return getThreadById(companyId, thread.id, currentUser);
}

export async function postMessage(companyId, threadId, currentUser, payload) {
  const thread = await ensureThreadAccessible(companyId, threadId, currentUser.id);
  const messageTimestamp = new Date();
  const statusReopened = thread.status === "closed";

  ensureAttachmentPermission(currentUser, payload.attachmentUrl);

  if (thread.status === "closed" && !canCloseThreads(currentUser)) {
    throw forbidden(
      "Диалог закрыт. Только пользователь с правом изменения статуса может открыть его снова."
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.create({
      data: {
        threadId,
        senderId: currentUser.id,
        content: payload.content?.trim() ?? "",
        attachmentUrl: payload.attachmentUrl ?? null
      }
    });

    await tx.chatThread.update({
      where: {
        id: threadId
      },
      data: {
        status: statusReopened ? "open" : thread.status,
        lastMessageAt: messageTimestamp
      }
    });

    await tx.chatThreadParticipant.update({
      where: {
        threadId_userId: {
          threadId,
          userId: currentUser.id
        }
      },
      data: {
        lastReadAt: messageTimestamp
      }
    });
  });

  const auditTasks = [
    recordAuditEvent({
      companyId,
      actorId: currentUser.id,
      action: "chat.message_posted",
      entityType: "chat_thread",
      entityId: threadId,
      metadata: {
        hasAttachment: Boolean(payload.attachmentUrl)
      }
    })
  ];

  if (statusReopened) {
    auditTasks.push(
      recordAuditEvent({
        companyId,
        actorId: currentUser.id,
        action: "chat.thread_status_changed",
        entityType: "chat_thread",
        entityId: threadId,
        metadata: {
          previousStatus: "closed",
          nextStatus: "open",
          source: "message_posted"
        }
      })
    );
  }

  await Promise.all([
    queueNotification({
      companyId,
      triggeredById: currentUser.id,
      recipients: thread.participants
        .filter((participant) => participant.userId !== currentUser.id)
        .map((participant) => participant.userId),
      title: `Новое сообщение: ${thread.subject}`,
      body: payload.content?.trim() || "В диалоге появилось новое вложение.",
      category: "chat_message",
      metadata: {
        threadId
      }
    }),
    ...auditTasks
  ]);

  emitToUsers(
    thread.participants.map((participant) => participant.userId),
    "chat:changed",
    {
      type: "message_posted",
      threadId
    }
  );

  return getThreadById(companyId, threadId, currentUser);
}

export async function updateThread(companyId, threadId, currentUser, payload) {
  const thread = await ensureThreadAccessible(companyId, threadId, currentUser.id);
  const settingsChangeRequested =
    payload.subject !== undefined || payload.category !== undefined;
  const statusChangeRequested = payload.status !== undefined;
  const assigneeChangeRequested = payload.assignedToId !== undefined;

  if (settingsChangeRequested && !canManageThreadSettings(currentUser)) {
    throw forbidden("Недостаточно прав для изменения темы и типа диалога");
  }

  if (statusChangeRequested && !canCloseThreads(currentUser)) {
    throw forbidden("Недостаточно прав для изменения статуса диалога");
  }

  if (assigneeChangeRequested && !canAssignThreads(currentUser)) {
    throw forbidden("Недостаточно прав для назначения ответственного по диалогу");
  }

  let nextAssignee = thread.assignee;
  let nextAssigneeId = thread.assignedToId ?? null;

  if (payload.assignedToId !== undefined) {
    if (payload.assignedToId === null) {
      nextAssignee = null;
      nextAssigneeId = null;
    } else {
      const assignee = await ensureUserBelongsToCompany(companyId, payload.assignedToId);

      if (!isManagementUser(assignee)) {
        throw badRequest("Назначить диалог можно только руководителю или HR");
      }

      nextAssignee = assignee;
      nextAssigneeId = assignee.id;
    }
  }

  const updateData = {};

  if (payload.subject !== undefined && payload.subject !== thread.subject) {
    updateData.subject = payload.subject;
  }

  if (payload.category !== undefined && payload.category !== thread.category) {
    updateData.category = payload.category;
  }

  if (payload.status !== undefined && payload.status !== thread.status) {
    updateData.status = payload.status;
  }

  if (payload.assignedToId !== undefined && nextAssigneeId !== (thread.assignedToId ?? null)) {
    updateData.assignedToId = nextAssigneeId;
  }

  if (!Object.keys(updateData).length) {
    return getThreadById(companyId, threadId, currentUser);
  }

  const updatedThread = await prisma.$transaction(async (tx) => {
    await tx.chatThread.update({
      where: {
        id: threadId
      },
      data: updateData
    });

    if (nextAssigneeId) {
      await tx.chatThreadParticipant.upsert({
        where: {
          threadId_userId: {
            threadId,
            userId: nextAssigneeId
          }
        },
        update: {},
        create: {
          threadId,
          userId: nextAssigneeId,
          lastReadAt: null
        }
      });
    }

    return tx.chatThread.findUnique({
      where: {
        id: threadId
      },
      include: threadDetailInclude
    });
  });

  const auditTasks = [];

  if (updateData.subject !== undefined || updateData.category !== undefined) {
    auditTasks.push(
      recordAuditEvent({
        companyId,
        actorId: currentUser.id,
        action: "chat.thread_settings_changed",
        entityType: "chat_thread",
        entityId: threadId,
        metadata: {
          previousSubject: thread.subject,
          nextSubject: updatedThread.subject,
          previousCategory: thread.category,
          nextCategory: updatedThread.category,
          changedFields: Object.keys(updateData).filter((field) =>
            ["subject", "category"].includes(field)
          )
        }
      })
    );
  }

  if (updateData.status !== undefined) {
    auditTasks.push(
      recordAuditEvent({
        companyId,
        actorId: currentUser.id,
        action: "chat.thread_status_changed",
        entityType: "chat_thread",
        entityId: threadId,
        metadata: {
          previousStatus: thread.status,
          nextStatus: updatedThread.status
        }
      })
    );
  }

  if (updateData.assignedToId !== undefined) {
    auditTasks.push(
      recordAuditEvent({
        companyId,
        actorId: currentUser.id,
        action: "chat.thread_assignee_changed",
        entityType: "chat_thread",
        entityId: threadId,
        metadata: {
          previousAssignee: createUserSnapshot(thread.assignee),
          nextAssignee: createUserSnapshot(nextAssignee)
        }
      })
    );
  }

  const newAssigneeId = updateData.assignedToId ?? null;
  const notificationTasks =
    newAssigneeId && newAssigneeId !== currentUser.id
      ? [
          queueNotification({
            companyId,
            triggeredById: currentUser.id,
            recipients: [newAssigneeId],
            title: `Вам назначен диалог: ${updatedThread.subject}`,
            body: "Откройте чат, чтобы посмотреть детали обращения.",
            category: "chat_thread",
            metadata: {
              threadId
            }
          })
        ]
      : [];

  await Promise.all([...auditTasks, ...notificationTasks]);

  emitToUsers(
    updatedThread.participants.map((participant) => participant.userId),
    "chat:changed",
    {
      type: "thread_updated",
      threadId
    }
  );

  return getThreadById(companyId, threadId, currentUser);
}

export async function markThreadRead(companyId, threadId, currentUser) {
  const thread = await ensureThreadAccessible(companyId, threadId, currentUser.id);
  const participant = findParticipantRecord(thread, currentUser.id);

  if (
    participant?.lastReadAt &&
    thread.lastMessageAt &&
    new Date(participant.lastReadAt).getTime() >= new Date(thread.lastMessageAt).getTime()
  ) {
    return { updated: false };
  }

  await prisma.chatThreadParticipant.update({
    where: {
      threadId_userId: {
        threadId,
        userId: currentUser.id
      }
    },
    data: {
      lastReadAt: new Date()
    }
  });

  emitToUsers(
    thread.participants.map((participantRecord) => participantRecord.userId),
    "chat:changed",
    {
      type: "thread_read",
      threadId
    }
  );

  return { updated: true };
}

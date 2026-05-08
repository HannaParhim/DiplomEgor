import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { SelectMenu } from "../../components/SelectMenu.jsx";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  formatChatCategory,
  formatChatStatus,
  formatDate,
  formatRoleName
} from "../../utils/format.js";

const CATEGORY_OPTIONS = [
  { value: "question", label: "Вопрос", description: "Нужно разъяснение" },
  { value: "request", label: "Запрос", description: "Нужно действие" },
  { value: "feedback", label: "Обратная связь", description: "Комментарий или идея" },
  { value: "incident", label: "Проблема", description: "Нужна быстрая реакция" }
];

const STATUS_OPTIONS = [
  { value: "open", label: "Открыт", description: "Диалог в работе" },
  { value: "closed", label: "Закрыт", description: "Диалог в архиве" }
];

const ACTIVE_FILTERS = [
  { value: "all", label: "Все" },
  { value: "needReply", label: "Нужно ответить" },
  { value: "waiting", label: "Ждём ответ" }
];

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

const emptyThreadForm = () => ({
  recipientId: "",
  subject: "",
  category: "question",
  content: "",
  attachmentUrl: ""
});

const emptyReplyForm = () => ({ content: "", attachmentUrl: "" });

const emptyMetaForm = () => ({
  subject: "",
  category: "question",
  status: "open",
  assignedToId: ""
});

const getThreadTitle = (thread) =>
  thread.counterparties?.map((user) => user.name).join(", ") ||
  thread.assignee?.name ||
  thread.creator?.name ||
  "Диалог";

const buildMetaForm = (thread) => ({
  subject: thread.subject ?? "",
  category: thread.category ?? "question",
  status: thread.status ?? "open",
  assignedToId: thread.assignee?.id ? String(thread.assignee.id) : ""
});

const uploadFile = async (file, token) => {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest("/uploads", { method: "POST", token, body: formData });
};

const describeEvent = (event) => {
  const actor = event.actor?.name ?? "Система";
  const metadata = event.metadata ?? {};

  if (event.action === "chat.thread_created") {
    return {
      title: `${actor} создал(а) диалог`,
      description: metadata.assignedTo
        ? `Первичный ответственный: ${metadata.assignedTo.name}`
        : "Без назначенного ответственного"
    };
  }

  if (event.action === "chat.thread_assignee_changed") {
    return {
      title: `${actor} изменил(а) ответственного`,
      description: `${metadata.previousAssignee?.name ?? "не назначен"} → ${metadata.nextAssignee?.name ?? "не назначен"}`
    };
  }

  if (event.action === "chat.thread_status_changed") {
    return {
      title: `${actor} изменил(а) статус`,
      description: `${formatChatStatus(metadata.previousStatus)} → ${formatChatStatus(metadata.nextStatus)}`
    };
  }

  return {
    title: `${actor} обновил(а) параметры`,
    description: "Изменены тема или тип диалога."
  };
};

export function ChatPage() {
  const { token, socket, user, hasPermission } = useAuth();
  const [threads, setThreads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadForm, setThreadForm] = useState(emptyThreadForm());
  const [replyForm, setReplyForm] = useState(emptyReplyForm());
  const [metaForm, setMetaForm] = useState(emptyMetaForm());
  const [viewMode, setViewMode] = useState("active");
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canUploadAttachments = hasPermission("chat_upload_attachments");
  const canViewThreadSettings = hasPermission("chat_view_thread_settings");
  const canManageThreadSettings = hasPermission("chat_manage_thread_settings");
  const canCloseThreads = hasPermission("chat_close_threads");
  const canAssignThreads = hasPermission("chat_assign_threads");
  const isChatOperator = CHAT_OPERATOR_PERMISSIONS.some((permission) => hasPermission(permission));

  const managementContacts = contacts.filter((contact) => contact.isManagement);
  const availableRecipients = isChatOperator ? contacts : managementContacts;
  const activeThreadsCount = threads.filter((thread) => thread.status !== "closed").length;
  const archiveThreadsCount = threads.filter((thread) => thread.status === "closed").length;

  const recipientOptions = availableRecipients.map((contact) => ({
    value: String(contact.id),
    label: contact.name,
    description: [formatRoleName(contact.role?.name), contact.department?.name]
      .filter(Boolean)
      .join(" · ")
  }));

  const assigneeOptions = [
    { value: "", label: "Не назначен", description: "Диалог без владельца" },
    ...managementContacts.map((contact) => ({
      value: String(contact.id),
      label: contact.name,
      description: [formatRoleName(contact.role?.name), contact.department?.name]
        .filter(Boolean)
        .join(" · ")
    }))
  ];

  const visibleThreads = threads.filter((thread) => {
    const text = [thread.subject, getThreadTitle(thread), thread.lastMessagePreview]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!text.includes(search.trim().toLowerCase())) {
      return false;
    }

    if (viewMode === "archive") {
      return thread.status === "closed";
    }

    if (thread.status === "closed") {
      return false;
    }

    if (activeFilter === "needReply") {
      return thread.needsReplyFromCurrentUser;
    }

    if (activeFilter === "waiting") {
      return thread.waitingForOtherSide;
    }

    return true;
  });

  const loadContacts = async () => {
    const result = await apiRequest("/chat/contacts", { token });
    setContacts(result);
  };

  const loadThreads = async () => {
    setLoadingThreads(true);
    try {
      const result = await apiRequest("/chat/threads", { token });
      setThreads(result);
      setSelectedThreadId((current) =>
        current && result.some((thread) => thread.id === current)
          ? current
          : (result[0]?.id ?? null)
      );
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadThread = async (threadId, { markRead = true } = {}) => {
    if (!threadId) {
      setSelectedThread(null);
      return;
    }

    setLoadingThread(true);
    try {
      const detail = await apiRequest(`/chat/threads/${threadId}`, { token });
      setSelectedThread(detail);
      setMetaForm(buildMetaForm(detail));

      if (markRead && detail.unreadCount > 0) {
        await apiRequest(`/chat/threads/${threadId}/read`, { method: "POST", token });
        setThreads((current) =>
          current.map((thread) =>
            thread.id === threadId ? { ...thread, unreadCount: 0 } : thread
          )
        );
      }
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    Promise.all([loadContacts(), loadThreads()]).catch((loadError) => {
      setError(loadError.message);
    });
  }, [token]);

  useEffect(() => {
    loadThread(selectedThreadId).catch((loadError) => setError(loadError.message));
  }, [selectedThreadId, token]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadThreads().catch(() => {});
      if (selectedThreadId) {
        loadThread(selectedThreadId, { markRead: false }).catch(() => {});
      }
    }, 120000);

    return () => clearInterval(intervalId);
  }, [selectedThreadId, token]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleChatChanged = (payload) => {
      loadThreads().catch(() => {});
      if (selectedThreadId && (!payload?.threadId || payload.threadId === selectedThreadId)) {
        loadThread(selectedThreadId, { markRead: true }).catch(() => {});
      }
    };

    socket.on("chat:changed", handleChatChanged);
    return () => socket.off("chat:changed", handleChatChanged);
  }, [socket, selectedThreadId, token]);

  const switchViewMode = (nextMode) => {
    setViewMode(nextMode);
    setActiveFilter("all");

    const nextThread = threads.find((thread) =>
      nextMode === "archive" ? thread.status === "closed" : thread.status !== "closed"
    );

    if (nextThread) {
      setSelectedThreadId(nextThread.id);
    }
  };

  const handleUpload = async (target, file) => {
    if (!file) {
      return;
    }

    setUploadingTarget(target);
    setError("");
    setMessage("");

    try {
      const result = await uploadFile(file, token);
      if (target === "thread") {
        setThreadForm((current) => ({ ...current, attachmentUrl: result.fileUrl }));
      }
      if (target === "reply") {
        setReplyForm((current) => ({ ...current, attachmentUrl: result.fileUrl }));
      }
      setMessage("Вложение загружено.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploadingTarget("");
    }
  };

  const handleCreateThread = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    setMessage("");

    try {
      const createdThread = await apiRequest("/chat/threads", {
        method: "POST",
        token,
        body: {
          recipientId: Number(threadForm.recipientId),
          subject: threadForm.subject,
          category: threadForm.category,
          content: threadForm.content,
          attachmentUrl: threadForm.attachmentUrl || null
        }
      });

      setThreadForm(emptyThreadForm());
      setMessage("Диалог создан.");
      await loadThreads();
      setViewMode("active");
      setActiveFilter("all");
      setSelectedThreadId(createdThread.id);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!selectedThreadId) {
      return;
    }

    setSending(true);
    setError("");
    setMessage("");

    try {
      const updatedThread = await apiRequest(`/chat/threads/${selectedThreadId}/messages`, {
        method: "POST",
        token,
        body: {
          content: replyForm.content,
          attachmentUrl: replyForm.attachmentUrl || null
        }
      });

      setSelectedThread(updatedThread);
      setMetaForm(buildMetaForm(updatedThread));
      setReplyForm(emptyReplyForm());
      await loadThreads();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSending(false);
    }
  };

  const handleSaveThread = async (event) => {
    event.preventDefault();
    if (!selectedThread) {
      return;
    }

    const payload = {};
    if (canManageThreadSettings && metaForm.subject !== selectedThread.subject) {
      payload.subject = metaForm.subject;
    }
    if (canManageThreadSettings && metaForm.category !== selectedThread.category) {
      payload.category = metaForm.category;
    }
    if (canCloseThreads && metaForm.status !== selectedThread.status) {
      payload.status = metaForm.status;
    }

    const currentAssigneeId = selectedThread.assignee?.id ? String(selectedThread.assignee.id) : "";
    if (canAssignThreads && metaForm.assignedToId !== currentAssigneeId) {
      payload.assignedToId = metaForm.assignedToId ? Number(metaForm.assignedToId) : null;
    }

    if (!Object.keys(payload).length) {
      setMessage("Изменений нет.");
      return;
    }

    setSavingMeta(true);
    setError("");
    setMessage("");

    try {
      const updatedThread = await apiRequest(`/chat/threads/${selectedThread.id}`, {
        method: "PUT",
        token,
        body: payload
      });
      setSelectedThread(updatedThread);
      setMetaForm(buildMetaForm(updatedThread));
      setMessage("Параметры диалога сохранены.");
      await loadThreads();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSavingMeta(false);
    }
  };

  const isReplyLocked = selectedThread?.status === "closed" && !canCloseThreads;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Коммуникации"
        title="Чат с архивом и журналом изменений"
        description="Сразу видно текущего ответственного, историю назначений и закрытые диалоги в отдельном архивном режиме."
      />

      {message ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
        <div className="space-y-6">
          <section className="panel space-y-4">
            <h2 className="text-xl font-bold text-ink">Новый диалог</h2>
            <form className="space-y-3" onSubmit={handleCreateThread}>
              <SelectMenu value={threadForm.recipientId} options={recipientOptions} placeholder="Выберите получателя" onChange={(value) => setThreadForm((current) => ({ ...current, recipientId: value }))} />
              <input className="field" placeholder="Тема обращения" value={threadForm.subject} onChange={(event) => setThreadForm((current) => ({ ...current, subject: event.target.value }))} required />
              <SelectMenu value={threadForm.category} options={CATEGORY_OPTIONS} onChange={(value) => setThreadForm((current) => ({ ...current, category: value }))} />
              <textarea className="field min-h-[130px]" placeholder="Опишите запрос" value={threadForm.content} onChange={(event) => setThreadForm((current) => ({ ...current, content: event.target.value }))} />
              {threadForm.attachmentUrl ? <div className="rounded-3xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">Вложение готово: <a href={threadForm.attachmentUrl}>{threadForm.attachmentUrl}</a></div> : null}
              <div className="flex flex-wrap gap-3">
                {canUploadAttachments ? <label className="btn-secondary cursor-pointer">{uploadingTarget === "thread" ? "Загрузка..." : "Добавить файл"}<input className="hidden" type="file" onChange={(event) => handleUpload("thread", event.target.files?.[0])} /></label> : null}
                <button className="btn-primary" type="submit" disabled={sending || !threadForm.recipientId}>{sending ? "Создаём..." : "Создать диалог"}</button>
              </div>
            </form>
          </section>

          <section className="panel space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">В работе</p><p className="mt-3 text-2xl font-extrabold text-ink">{activeThreadsCount}</p></div>
              <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Архив</p><p className="mt-3 text-2xl font-extrabold text-ink">{archiveThreadsCount}</p></div>
            </div>

            <div className="segment-control">
              <button type="button" className="segment-chip" data-active={viewMode === "active" ? "true" : "false"} onClick={() => switchViewMode("active")}>{`В работе`}</button>
              <button type="button" className="segment-chip" data-active={viewMode === "archive" ? "true" : "false"} onClick={() => switchViewMode("archive")}>{`Архив`}</button>
            </div>

            <input className="field" placeholder={viewMode === "archive" ? "Поиск по архиву" : "Поиск по активным диалогам"} value={search} onChange={(event) => setSearch(event.target.value)} />

            {viewMode === "active" ? (
              <div className="segment-control">
                {ACTIVE_FILTERS.map((filterOption) => (
                  <button key={filterOption.value} type="button" className="segment-chip" data-active={activeFilter === filterOption.value ? "true" : "false"} onClick={() => setActiveFilter(filterOption.value)}>
                    {filterOption.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
              {loadingThreads ? <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">Загружаем диалоги...</div> : null}
              {!loadingThreads && visibleThreads.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">{viewMode === "archive" ? "Архив пуст." : "Подходящих активных диалогов пока нет."}</div> : null}
              {visibleThreads.map((thread) => (
                <button key={thread.id} type="button" className={`w-full rounded-[1.8rem] border px-4 py-4 text-left transition ${selectedThreadId === thread.id ? "border-brand-200 bg-brand-50 shadow-[0_18px_36px_rgba(15,122,101,0.12)]" : "border-slate-200 bg-white hover:border-brand-100 hover:shadow-[0_14px_28px_rgba(15,122,101,0.08)]"}`} onClick={() => setSelectedThreadId(thread.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold text-ink">{thread.subject}</p><p className="mt-1 text-sm text-slate-500">{getThreadTitle(thread)}</p></div>
                    {thread.unreadCount > 0 ? <span className="rounded-full bg-brand-600 px-2 py-1 text-xs font-bold text-white">{thread.unreadCount}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{formatChatCategory(thread.category)}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${thread.status === "closed" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{thread.status === "closed" ? "Архив" : "В работе"}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">{thread.lastMessagePreview || "Пока без текста"}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400"><span>{thread.assignee ? `Ответственный: ${thread.assignee.name}` : "Без ответственного"}</span><span>{formatDate(thread.lastMessageAt)}</span></div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel min-h-[320px]">
            {!selectedThread ? (
              <div className="flex min-h-[260px] items-center justify-center text-sm text-slate-500">Выберите диалог слева.</div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-[32px] border border-[#d8e1dc] bg-[linear-gradient(145deg,_rgba(255,252,247,0.98),_rgba(241,249,245,0.96)_56%,_rgba(235,244,240,0.94)_100%)] p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">{selectedThread.status === "closed" ? "Архивный диалог" : "Активный диалог"}</p>
                      <h2 className="mt-3 text-2xl font-bold text-ink">{selectedThread.subject}</h2>
                      <p className="mt-2 text-sm text-slate-500">{getThreadTitle(selectedThread)} · {formatChatCategory(selectedThread.category)} · {formatChatStatus(selectedThread.status)}</p>
                    </div>
                    <div className="rounded-[1.6rem] border border-white/80 bg-white/85 px-4 py-4 text-sm text-slate-600 shadow-[0_12px_30px_rgba(16,33,27,0.06)]">
                      <p className="font-semibold text-ink">{selectedThread.currentState?.assignee ? `Сейчас отвечает: ${selectedThread.currentState.assignee.name}` : "Сейчас ответственный не назначен"}</p>
                      <p className="mt-1 text-xs text-slate-500">{selectedThread.currentState?.assignedBy ? `Назначил: ${selectedThread.currentState.assignedBy.name} · ${formatDate(selectedThread.currentState.assignedAt)}` : "Назначение ещё не выполнялось"}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[1.5rem] border border-white/80 bg-white/88 px-4 py-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Ответственный</p><p className="mt-2 text-sm font-semibold text-ink">{selectedThread.currentState?.assignee?.name ?? "Не назначен"}</p></div>
                    <div className="rounded-[1.5rem] border border-white/80 bg-white/88 px-4 py-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Статус</p><p className="mt-2 text-sm font-semibold text-ink">{formatChatStatus(selectedThread.currentState?.status)}</p></div>
                    <div className="rounded-[1.5rem] border border-white/80 bg-white/88 px-4 py-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Создал</p><p className="mt-2 text-sm font-semibold text-ink">{selectedThread.currentState?.createdBy?.name}</p><p className="mt-1 text-xs text-slate-500">{formatDate(selectedThread.currentState?.createdAt)}</p></div>
                    <div className="rounded-[1.5rem] border border-white/80 bg-white/88 px-4 py-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">{selectedThread.status === "closed" ? "Закрыт" : "Последнее сообщение"}</p><p className="mt-2 text-sm font-semibold text-ink">{selectedThread.status === "closed" ? selectedThread.currentState?.closedBy?.name ?? "Не указано" : selectedThread.currentState?.assignee?.name ?? "Без ответственного"}</p><p className="mt-1 text-xs text-slate-500">{selectedThread.status === "closed" ? formatDate(selectedThread.currentState?.closedAt) : formatDate(selectedThread.currentState?.lastMessageAt)}</p></div>
                  </div>
                </div>

                <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
                  {loadingThread ? <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">Загружаем переписку...</div> : null}
                  {selectedThread.messages?.map((chatMessage) => {
                    const isOwnMessage = chatMessage.sender.id === user?.id;
                    return (
                      <div key={chatMessage.id} className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[86%] rounded-[28px] px-5 py-4 ${isOwnMessage ? "bg-[linear-gradient(135deg,_#0f7a65_0%,_#0b5a4b_100%)] text-white shadow-[0_18px_36px_rgba(15,122,101,0.2)]" : "border border-slate-200 bg-white text-ink shadow-[0_14px_28px_rgba(16,33,27,0.05)]"}`}>
                          <p className={`text-sm font-semibold ${isOwnMessage ? "text-white/92" : "text-slate-700"}`}>{chatMessage.sender.name} · {formatRoleName(chatMessage.sender.role?.name)}</p>
                          {chatMessage.content ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{chatMessage.content}</p> : null}
                          {chatMessage.attachmentUrl ? <a className={`mt-3 inline-flex rounded-full px-3 py-2 text-xs font-semibold ${isOwnMessage ? "bg-white/15 text-white" : "bg-brand-50 text-brand-700"}`} href={chatMessage.attachmentUrl} target="_blank" rel="noreferrer">Открыть вложение</a> : null}
                          <p className={`mt-3 text-xs ${isOwnMessage ? "text-white/70" : "text-slate-400"}`}>{formatDate(chatMessage.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form className="space-y-3" onSubmit={handleSendMessage}>
                  <textarea className="field min-h-[130px]" placeholder={isReplyLocked ? "Диалог в архиве. Сначала откройте его, если у вас есть право." : "Введите ответ"} value={replyForm.content} onChange={(event) => setReplyForm((current) => ({ ...current, content: event.target.value }))} disabled={isReplyLocked} />
                  {replyForm.attachmentUrl ? <div className="rounded-3xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">Вложение готово: <a href={replyForm.attachmentUrl}>{replyForm.attachmentUrl}</a></div> : null}
                  <div className="flex flex-wrap gap-3">
                    {canUploadAttachments ? <label className="btn-secondary cursor-pointer">{uploadingTarget === "reply" ? "Загрузка..." : "Прикрепить файл"}<input className="hidden" type="file" onChange={(event) => handleUpload("reply", event.target.files?.[0])} disabled={isReplyLocked} /></label> : null}
                    <button className="btn-primary" type="submit" disabled={sending || isReplyLocked}>{sending ? "Отправляем..." : "Отправить"}</button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {selectedThread ? (
            <div className={`grid gap-6 ${canViewThreadSettings ? "xl:grid-cols-[1fr,0.95fr]" : ""}`}>
              {canViewThreadSettings ? (
                <section className="panel space-y-4">
                <h2 className="text-xl font-bold text-ink">Параметры диалога</h2>
                <form className="grid gap-4" onSubmit={handleSaveThread}>
                  <input className="field" value={metaForm.subject} onChange={(event) => setMetaForm((current) => ({ ...current, subject: event.target.value }))} disabled={!canManageThreadSettings} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-600">Тип</label>
                      <SelectMenu value={metaForm.category} options={CATEGORY_OPTIONS} onChange={(value) => setMetaForm((current) => ({ ...current, category: value }))} disabled={!canManageThreadSettings} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-600">Статус</label>
                      <SelectMenu value={metaForm.status} options={STATUS_OPTIONS} onChange={(value) => setMetaForm((current) => ({ ...current, status: value }))} disabled={!canCloseThreads} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">Ответственный</label>
                    <SelectMenu value={metaForm.assignedToId} options={assigneeOptions} onChange={(value) => setMetaForm((current) => ({ ...current, assignedToId: value }))} disabled={!canAssignThreads} />
                  </div>
                  <div><button className="btn-primary" type="submit" disabled={savingMeta}>{savingMeta ? "Сохраняем..." : "Сохранить параметры"}</button></div>
                </form>
              </section>
              ) : null}

              <section className="panel space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="text-xl font-bold text-ink">Журнал изменений</h2><p className="mt-1 text-sm text-slate-500">Кто назначал, закрывал и менял параметры чата.</p></div>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">{selectedThread.activity?.length ?? 0} событий</span>
                </div>
                <div className="space-y-3">
                  {(selectedThread.activity ?? []).length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">Для этого диалога пока нет системных событий.</div> : null}
                  {(selectedThread.activity ?? []).map((event) => {
                    const entry = describeEvent(event);
                    return (
                      <div key={event.id} className="rounded-[1.6rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_24px_rgba(16,33,27,0.04)]">
                        <div className="flex items-start justify-between gap-3">
                          <div><p className="font-semibold text-ink">{entry.title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{entry.description}</p></div>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{formatDate(event.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

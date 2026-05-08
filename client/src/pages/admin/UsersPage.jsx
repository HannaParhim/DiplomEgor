import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { formatDate, formatRoleName, formatUserStatus } from "../../utils/format.js";

const initialCreateForm = {
  name: "",
  email: "",
  password: "",
  roleId: "",
  departmentId: "",
  position: "",
  sendInvite: false
};

const initialEditForm = {
  name: "",
  email: "",
  roleId: "",
  departmentId: "",
  position: "",
  status: "active",
  password: ""
};

const statusOptions = [
  { value: "all", label: "Все статусы" },
  { value: "active", label: "Активные" },
  { value: "invited", label: "Приглашенные" },
  { value: "blocked", label: "Заблокированные" }
];

const normalizeDateInput = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const toIsoDeadline = (value) => (value ? new Date(`${value}T12:00:00`).toISOString() : null);

export function UsersPage() {
  const { token, company } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [editForm, setEditForm] = useState(initialEditForm);
  const [assignmentForm, setAssignmentForm] = useState({
    courseIds: [],
    deadline: ""
  });
  const [assignmentDeadlines, setAssignmentDeadlines] = useState({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [createdAccess, setCreatedAccess] = useState(null);
  const [invitePassword, setInvitePassword] = useState("");
  const [resetPasswordResult, setResetPasswordResult] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyAction, setBusyAction] = useState("");

  const loadBaseData = async () => {
    const [usersResult, rolesResult, departmentsResult, coursesResult] = await Promise.all([
      apiRequest("/users", { token }),
      apiRequest("/roles", { token }),
      apiRequest("/departments", { token }),
      apiRequest("/courses?scope=company", { token })
    ]);

    setUsers(usersResult);
    setRoles(rolesResult);
    setDepartments(departmentsResult);
    setCourses(coursesResult);
  };

  const loadUserDetails = async (userId) => {
    if (!userId) {
      setSelectedUser(null);
      return;
    }

    setLoadingDetail(true);

    try {
      const result = await apiRequest(`/users/${userId}`, { token });
      setSelectedUser(result);
      setEditForm({
        name: result.name,
        email: result.email,
        roleId: String(result.role?.id ?? ""),
        departmentId: result.department?.id ? String(result.department.id) : "",
        position: result.position ?? "",
        status: result.status,
        password: ""
      });
      setAssignmentDeadlines(
        Object.fromEntries(
          result.assignments.map((assignment) => [assignment.id, normalizeDateInput(assignment.deadline)])
        )
      );
      setError("");
    } catch (loadError) {
      setError(loadError.message);
      setSelectedUser(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const refreshUsers = async (nextSelectedUserId = selectedUserId) => {
    try {
      await loadBaseData();

      if (nextSelectedUserId) {
        await loadUserDetails(nextSelectedUserId);
      }
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadBaseData()
      .then(() => setError(""))
      .catch((loadError) => setError(loadError.message));
  }, [token]);

  useEffect(() => {
    if (roles.length > 0 && !createForm.roleId) {
      setCreateForm((current) => ({
        ...current,
        roleId: String(roles[0].id)
      }));
    }
  }, [roles, createForm.roleId]);

  useEffect(() => {
    if (users.length === 0) {
      setSelectedUserId(null);
      setSelectedUser(null);
      return;
    }

    if (!selectedUserId || !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  useEffect(() => {
    loadUserDetails(selectedUserId);
  }, [selectedUserId, token]);

  const filteredUsers = users.filter((user) => {
    const searchValue = search.trim().toLowerCase();
    const searchSource = [user.name, user.email, user.position, user.department?.name, user.role?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !searchValue || searchSource.includes(searchValue);
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    const matchesRole = roleFilter === "all" || String(user.role?.id ?? "") === roleFilter;
    const matchesDepartment =
      departmentFilter === "all" ||
      (departmentFilter === "none"
        ? !user.department
        : String(user.department?.id ?? "") === departmentFilter);

    return matchesSearch && matchesStatus && matchesRole && matchesDepartment;
  });

  const usersStats = {
    total: users.length,
    active: users.filter((user) => user.status === "active").length,
    invited: users.filter((user) => user.status === "invited").length,
    blocked: users.filter((user) => user.status === "blocked").length
  };

  const assignedCourseIds = new Set(selectedUser?.assignments.map((assignment) => assignment.courseId) ?? []);
  const assignableCourses = courses.filter((course) => !assignedCourseIds.has(course.id));

  const clearFeedback = () => {
    setError("");
    setMessage("");
    setInvitePassword("");
    setCreatedAccess(null);
    setResetPasswordResult("");
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    clearFeedback();
    setBusyAction("create-user");

    try {
      const result = await apiRequest("/users", {
        method: "POST",
        token,
        body: {
          ...createForm,
          roleId: Number(createForm.roleId),
          departmentId: createForm.departmentId ? Number(createForm.departmentId) : null,
          password: createForm.password || undefined
        }
      });

      setInvitePassword(result.invitePassword ?? "");
      setCreatedAccess({
        email: createForm.email,
        password: createForm.sendInvite ? result.invitePassword ?? "" : createForm.password,
        companyName: company?.name ?? ""
      });
      setCreateForm({
        ...initialCreateForm,
        roleId: roles[0]?.id ? String(roles[0].id) : ""
      });
      setMessage(
        result.invitation
          ? "Сотрудник создан. Email-приглашение поставлено в очередь."
          : "Сотрудник создан."
      );
      await loadBaseData();
      setSelectedUserId(result.user.id);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleSaveUser = async (event) => {
    event.preventDefault();

    if (!selectedUser) {
      return;
    }

    clearFeedback();
    setBusyAction("save-user");

    try {
      await apiRequest(`/users/${selectedUser.id}`, {
        method: "PUT",
        token,
        body: {
          name: editForm.name,
          email: editForm.email,
          roleId: Number(editForm.roleId),
          departmentId: editForm.departmentId ? Number(editForm.departmentId) : null,
          position: editForm.position || null,
          status: editForm.status,
          password: editForm.password || undefined
        }
      });

      setEditForm((current) => ({
        ...current,
        password: ""
      }));
      setMessage("Профиль сотрудника обновлен.");
      await refreshUsers(selectedUser.id);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Удалить сотрудника или заблокировать его при наличии связанных данных?")) {
      return;
    }

    clearFeedback();
    setBusyAction(`delete-${userId}`);

    try {
      const result = await apiRequest(`/users/${userId}`, {
        method: "DELETE",
        token
      });

      setMessage(result.message || "Операция выполнена.");
      await loadBaseData();
      if (selectedUserId === userId) {
        setSelectedUserId(null);
      }
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleResendInvite = async (userId) => {
    clearFeedback();
    setBusyAction(`invite-${userId}`);

    try {
      const result = await apiRequest(`/users/${userId}/resend-invite`, {
        method: "POST",
        token
      });

      setMessage(result.message || "Приглашение поставлено в очередь.");
      await refreshUsers(userId);
    } catch (inviteError) {
      setError(inviteError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) {
      return;
    }

    clearFeedback();
    setBusyAction("reset-password");

    try {
      const result = await apiRequest(`/users/${selectedUser.id}/reset-password`, {
        method: "POST",
        token
      });

      setResetPasswordResult(result.temporaryPassword);
      setMessage("Временный пароль сформирован. Передайте его сотруднику безопасным способом.");
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleAssignCourses = async (event) => {
    event.preventDefault();

    if (!selectedUser || assignmentForm.courseIds.length === 0) {
      return;
    }

    clearFeedback();
    setBusyAction("assign-courses");

    try {
      const result = await apiRequest(`/users/${selectedUser.id}/assign-courses`, {
        method: "POST",
        token,
        body: {
          courseIds: assignmentForm.courseIds,
          deadline: toIsoDeadline(assignmentForm.deadline)
        }
      });

      setAssignmentForm({
        courseIds: [],
        deadline: ""
      });
      setMessage(
        result.skippedCount > 0
          ? `Назначено ${result.createdCount} курсов. Уже были назначены: ${result.skippedCount}.`
          : `Курсы назначены: ${result.createdCount}.`
      );
      await refreshUsers(selectedUser.id);
    } catch (assignError) {
      setError(assignError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleUpdateAssignment = async (assignmentId) => {
    if (!selectedUser) {
      return;
    }

    clearFeedback();
    setBusyAction(`assignment-${assignmentId}`);

    try {
      await apiRequest(`/users/${selectedUser.id}/assignments/${assignmentId}`, {
        method: "PUT",
        token,
        body: {
          deadline: toIsoDeadline(assignmentDeadlines[assignmentId])
        }
      });

      setMessage("Дедлайн по курсу обновлен.");
      await refreshUsers(selectedUser.id);
    } catch (assignmentError) {
      setError(assignmentError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    if (!selectedUser) {
      return;
    }

    if (!window.confirm("Снять курс с сотрудника? Прогресс останется в истории.")) {
      return;
    }

    clearFeedback();
    setBusyAction(`remove-assignment-${assignmentId}`);

    try {
      await apiRequest(`/users/${selectedUser.id}/assignments/${assignmentId}`, {
        method: "DELETE",
        token
      });

      setMessage("Курс снят с сотрудника.");
      await refreshUsers(selectedUser.id);
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Команда"
        title="Сотрудники, доступы и назначенные курсы"
        description="Здесь можно создавать сотрудников, редактировать их профиль, менять роль и отдел, блокировать доступ, сбрасывать пароль и управлять назначенным обучением из одной карточки."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Всего</p>
          <p className="mt-2 text-2xl font-bold text-ink">{usersStats.total}</p>
          <p className="text-sm text-slate-500">сотрудников в системе</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Активные</p>
          <p className="mt-2 text-2xl font-bold text-ink">{usersStats.active}</p>
          <p className="text-sm text-slate-500">имеют доступ к платформе</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Приглашенные</p>
          <p className="mt-2 text-2xl font-bold text-ink">{usersStats.invited}</p>
          <p className="text-sm text-slate-500">ждут первого входа</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Заблокированные</p>
          <p className="mt-2 text-2xl font-bold text-ink">{usersStats.blocked}</p>
          <p className="text-sm text-slate-500">временно отключены</p>
        </div>
      </section>

      {message ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      <section className="panel">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink">Новый сотрудник</h2>
            <p className="mt-1 text-sm text-slate-500">
              Можно создать активный вход сразу или отправить приглашение с временным паролем.
            </p>
          </div>
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleCreateUser}>
          <input
            className="field"
            placeholder="ФИО сотрудника"
            value={createForm.name}
            onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
          <input
            className="field"
            type="email"
            placeholder="Электронная почта"
            value={createForm.email}
            onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
            required
          />
          <input
            className="field"
            type="password"
            placeholder={createForm.sendInvite ? "Пароль можно не задавать" : "Пароль для первого входа"}
            value={createForm.password}
            onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
            required={!createForm.sendInvite}
          />
          <select
            className="field"
            value={createForm.roleId}
            onChange={(event) => setCreateForm((current) => ({ ...current, roleId: event.target.value }))}
            required
          >
            <option value="">Выберите роль</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {formatRoleName(role.name)}
              </option>
            ))}
          </select>
          <select
            className="field"
            value={createForm.departmentId}
            onChange={(event) => setCreateForm((current) => ({ ...current, departmentId: event.target.value }))}
          >
            <option value="">Без отдела</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <input
            className="field"
            placeholder="Должность"
            value={createForm.position}
            onChange={(event) => setCreateForm((current) => ({ ...current, position: event.target.value }))}
          />

          <label className="flex items-center gap-3 rounded-3xl border border-slate-200 px-4 py-3 text-sm text-slate-600 md:col-span-2 xl:col-span-3">
            <input
              type="checkbox"
              checked={createForm.sendInvite}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, sendInvite: event.target.checked }))
              }
            />
            Отправить приглашение и сгенерировать временный пароль автоматически.
          </label>

          {createdAccess?.password ? (
            <div className="rounded-3xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700 md:col-span-2 xl:col-span-3">
              Данные для входа: <strong>{createdAccess.email}</strong> / <strong>{createdAccess.password}</strong>
              {createdAccess.companyName ? ` · ${createdAccess.companyName}` : ""}
            </div>
          ) : null}

          {invitePassword ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 md:col-span-2 xl:col-span-3">
              Временный пароль для приглашения: <strong>{invitePassword}</strong>
            </div>
          ) : null}

          <div className="md:col-span-2 xl:col-span-3">
            <button className="btn-primary" type="submit" disabled={busyAction === "create-user"}>
              {busyAction === "create-user" ? "Создаем..." : "Создать сотрудника"}
            </button>
          </div>
        </form>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
        <aside className="space-y-6">
          <section className="panel space-y-4">
            <div>
              <h2 className="text-xl font-bold text-ink">Список сотрудников</h2>
              <p className="mt-1 text-sm text-slate-500">
                Быстрый поиск по имени, почте, роли и отделу.
              </p>
            </div>

            <input
              className="field"
              placeholder="Поиск по имени, почте или должности"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select className="field" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">Все роли</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {formatRoleName(role.name)}
                  </option>
                ))}
              </select>

              <select className="field" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                <option value="all">Все отделы</option>
                <option value="none">Без отдела</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                    user.id === selectedUserId
                      ? "border-brand-200 bg-brand-50"
                      : "border-slate-200 bg-white hover:border-brand-100"
                  }`}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{user.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      {formatUserStatus(user.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {formatRoleName(user.role?.name)} · {user.department?.name || "Без отдела"}
                  </p>
                  {user.position ? <p className="mt-1 text-sm text-slate-500">{user.position}</p> : null}
                </button>
              ))}

              {filteredUsers.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  По заданным фильтрам сотрудники не найдены.
                </div>
              ) : null}
            </div>
          </section>
        </aside>

        <section className="panel min-h-[720px]">
          {loadingDetail ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Загружаем карточку сотрудника...
            </div>
          ) : !selectedUser ? (
            <div className="flex h-full items-center justify-center rounded-4xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
              Выберите сотрудника слева, чтобы управлять доступом, ролями, курсами и сертификатами.
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-brand-700">Карточка сотрудника</p>
                  <h2 className="mt-2 text-3xl font-bold text-ink">{selectedUser.name}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedUser.email} · создан {formatDate(selectedUser.createdAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {selectedUser.status === "invited" ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleResendInvite(selectedUser.id)}
                      disabled={busyAction === `invite-${selectedUser.id}`}
                    >
                      {busyAction === `invite-${selectedUser.id}` ? "Отправляем..." : "Повторить инвайт"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleResetPassword}
                    disabled={busyAction === "reset-password"}
                  >
                    {busyAction === "reset-password" ? "Готовим..." : "Сбросить пароль"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    disabled={busyAction === `delete-${selectedUser.id}`}
                  >
                    {busyAction === `delete-${selectedUser.id}` ? "Обрабатываем..." : "Удалить / заблокировать"}
                  </button>
                </div>
              </div>

              {resetPasswordResult ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Новый временный пароль: <strong>{resetPasswordResult}</strong>
                </div>
              ) : null}

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Назначено</p>
                  <p className="mt-2 text-2xl font-bold text-ink">{selectedUser.stats.assignedCoursesCount}</p>
                  <p className="text-sm text-slate-500">курсов за все время</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">В работе</p>
                  <p className="mt-2 text-2xl font-bold text-ink">{selectedUser.stats.activeAssignmentsCount}</p>
                  <p className="text-sm text-slate-500">еще без сертификата</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Сертификаты</p>
                  <p className="mt-2 text-2xl font-bold text-ink">{selectedUser.stats.completedCoursesCount}</p>
                  <p className="text-sm text-slate-500">успешно завершенных курсов</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Просрочено</p>
                  <p className="mt-2 text-2xl font-bold text-ink">{selectedUser.stats.overdueAssignmentsCount}</p>
                  <p className="text-sm text-slate-500">активных дедлайнов</p>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[1fr,1fr]">
                <form className="space-y-4 rounded-4xl border border-slate-200 bg-slate-50 p-5" onSubmit={handleSaveUser}>
                  <div>
                    <h3 className="text-lg font-bold text-ink">Доступ и профиль</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Здесь меняются роль, отдел, статус и данные входа.
                    </p>
                  </div>

                  <input
                    className="field"
                    placeholder="ФИО"
                    value={editForm.name}
                    onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                  <input
                    className="field"
                    type="email"
                    placeholder="Электронная почта"
                    value={editForm.email}
                    onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                  <input
                    className="field"
                    placeholder="Должность"
                    value={editForm.position}
                    onChange={(event) => setEditForm((current) => ({ ...current, position: event.target.value }))}
                  />
                  <select
                    className="field"
                    value={editForm.roleId}
                    onChange={(event) => setEditForm((current) => ({ ...current, roleId: event.target.value }))}
                    required
                  >
                    <option value="">Выберите роль</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {formatRoleName(role.name)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="field"
                    value={editForm.departmentId}
                    onChange={(event) => setEditForm((current) => ({ ...current, departmentId: event.target.value }))}
                  >
                    <option value="">Без отдела</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="field"
                    value={editForm.status}
                    onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="active">Активен</option>
                    <option value="invited">Приглашен</option>
                    <option value="blocked">Заблокирован</option>
                  </select>
                  <input
                    className="field"
                    type="password"
                    placeholder="Новый пароль вручную (необязательно)"
                    value={editForm.password}
                    onChange={(event) => setEditForm((current) => ({ ...current, password: event.target.value }))}
                  />

                  <button className="btn-primary" type="submit" disabled={busyAction === "save-user"}>
                    {busyAction === "save-user" ? "Сохраняем..." : "Сохранить изменения"}
                  </button>
                </form>

                <form className="space-y-4 rounded-4xl border border-slate-200 bg-slate-50 p-5" onSubmit={handleAssignCourses}>
                  <div>
                    <h3 className="text-lg font-bold text-ink">Назначить обучение</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Выберите один или несколько курсов и задайте общий дедлайн.
                    </p>
                  </div>

                  <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
                    {assignableCourses.map((course) => {
                      const checked = assignmentForm.courseIds.includes(course.id);

                      return (
                        <label
                          key={course.id}
                          className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setAssignmentForm((current) => ({
                                ...current,
                                courseIds: event.target.checked
                                  ? [...current.courseIds, course.id]
                                  : current.courseIds.filter((courseId) => courseId !== course.id)
                              }))
                            }
                          />
                          <span>
                            <strong className="block text-ink">{course.title}</strong>
                            <span className="mt-1 block text-slate-500">
                              {course.lessonsCount} уроков · {course.modulesCount} модулей
                            </span>
                          </span>
                        </label>
                      );
                    })}

                    {assignableCourses.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                        У этого сотрудника уже назначены все доступные курсы.
                      </div>
                    ) : null}
                  </div>

                  <input
                    className="field"
                    type="date"
                    value={assignmentForm.deadline}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, deadline: event.target.value }))}
                  />

                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={busyAction === "assign-courses" || assignmentForm.courseIds.length === 0}
                  >
                    {busyAction === "assign-courses" ? "Назначаем..." : "Назначить выбранные курсы"}
                  </button>
                </form>
              </section>

              <section className="rounded-4xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-ink">Текущие назначения</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Можно менять дедлайн, отслеживать прогресс и снимать курс с сотрудника.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {selectedUser.assignments.map((assignment) => (
                    <article key={assignment.id} className="rounded-3xl border border-slate-200 bg-white px-5 py-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <h4 className="text-lg font-bold text-ink">{assignment.course.title}</h4>
                          <p className="mt-2 text-sm text-slate-500">
                            Прогресс: {assignment.completedLessons}/{assignment.lessonsCount} уроков · {assignment.progressPercent}%
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Назначил: {assignment.assignedBy?.name || "Не указано"} · {formatDate(assignment.assignedAt)}
                          </p>
                          {assignment.hasCertificate ? (
                            <p className="mt-2 text-sm font-semibold text-emerald-600">Сертификат уже выдан.</p>
                          ) : assignment.isOverdue ? (
                            <p className="mt-2 text-sm font-semibold text-rose-600">Дедлайн просрочен.</p>
                          ) : null}
                        </div>

                        <div className="grid gap-3 md:grid-cols-[180px,auto,auto]">
                          <input
                            className="field"
                            type="date"
                            value={assignmentDeadlines[assignment.id] ?? ""}
                            onChange={(event) =>
                              setAssignmentDeadlines((current) => ({
                                ...current,
                                [assignment.id]: event.target.value
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleUpdateAssignment(assignment.id)}
                            disabled={busyAction === `assignment-${assignment.id}`}
                          >
                            {busyAction === `assignment-${assignment.id}` ? "Сохраняем..." : "Сохранить дедлайн"}
                          </button>
                          <button
                            type="button"
                            className="rounded-full bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                            onClick={() => handleRemoveAssignment(assignment.id)}
                            disabled={busyAction === `remove-assignment-${assignment.id}`}
                          >
                            {busyAction === `remove-assignment-${assignment.id}` ? "Снимаем..." : "Снять курс"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}

                  {selectedUser.assignments.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                      У сотрудника пока нет назначенных курсов.
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-4xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-lg font-bold text-ink">Сертификаты сотрудника</h3>
                <p className="mt-1 text-sm text-slate-500">
                  История завершенного обучения и быстрый доступ к PDF.
                </p>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {selectedUser.certificates.map((certificate) => (
                    <article key={certificate.id} className="rounded-3xl border border-slate-200 bg-white px-5 py-5">
                      <h4 className="text-lg font-bold text-ink">{certificate.course?.title}</h4>
                      <p className="mt-2 text-sm text-slate-500">Выдан {formatDate(certificate.issuedAt)}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                        Код проверки {certificate.verificationCode}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <a className="btn-secondary" href={certificate.certificateUrl} target="_blank" rel="noreferrer">
                          Открыть HTML
                        </a>
                        {certificate.pdfUrl ? (
                          <a className="btn-primary" href={certificate.pdfUrl} target="_blank" rel="noreferrer">
                            Скачать PDF
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}

                  {selectedUser.certificates.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                      Сертификатов пока нет.
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

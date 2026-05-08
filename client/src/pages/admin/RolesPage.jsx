import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { formatPermission, formatRoleName } from "../../utils/format.js";

const permissionKeys = [
  "manage_users",
  "manage_company_focus",
  "create_courses",
  "edit_courses",
  "delete_courses",
  "assign_courses",
  "view_reports",
  "manage_roles",
  "manage_departments",
  "chat_view_thread_settings",
  "chat_upload_attachments",
  "chat_manage_thread_settings",
  "chat_close_threads",
  "chat_assign_threads"
];

const getEmptyPermissions = () =>
  Object.fromEntries(permissionKeys.map((key) => [key, false]));

const createEmptyForm = () => ({
  name: "",
  permissions: getEmptyPermissions()
});

export function RolesPage() {
  const { token } = useAuth();
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const loadRoles = async () => {
    const rolesResult = await apiRequest("/roles", { token });
    setRoles(rolesResult);
    return rolesResult;
  };

  useEffect(() => {
    loadRoles()
      .then((rolesResult) => {
        if (rolesResult[0] && !selectedRoleId) {
          setSelectedRoleId(rolesResult[0].id);
        }
      })
      .catch((loadError) => {
        setError(loadError.message);
      });
  }, [token]);

  useEffect(() => {
    if (!selectedRoleId) {
      return;
    }

    const selectedRole = roles.find((role) => role.id === selectedRoleId);

    if (!selectedRole) {
      return;
    }

    setForm({
      name: selectedRole.name,
      permissions: {
        ...getEmptyPermissions(),
        ...selectedRole.permissions
      }
    });
  }, [selectedRoleId, roles]);

  const clearFeedback = () => {
    setMessage("");
    setError("");
  };

  const refreshRoles = async (nextSelectedRoleId = selectedRoleId) => {
    const rolesResult = await loadRoles();

    if (!rolesResult.length) {
      setSelectedRoleId(null);
      return;
    }

    setSelectedRoleId(
      rolesResult.some((role) => role.id === nextSelectedRoleId)
        ? nextSelectedRoleId
        : rolesResult[0].id
    );
  };

  const handleCreateRole = async (event) => {
    event.preventDefault();
    clearFeedback();
    setBusyAction("create");

    try {
      const createdRole = await apiRequest("/roles", {
        method: "POST",
        token,
        body: form
      });

      setMessage("Роль создана.");
      await refreshRoles(createdRole.id);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleUpdateRole = async (event) => {
    event.preventDefault();

    if (!selectedRoleId) {
      return;
    }

    clearFeedback();
    setBusyAction("update");

    try {
      await apiRequest(`/roles/${selectedRoleId}`, {
        method: "PUT",
        token,
        body: form
      });

      setMessage("Роль обновлена.");
      await refreshRoles(selectedRoleId);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm("Удалить роль? Это возможно только если она никому не назначена.")) {
      return;
    }

    clearFeedback();
    setBusyAction(`delete-${roleId}`);

    try {
      await apiRequest(`/roles/${roleId}`, {
        method: "DELETE",
        token
      });

      setMessage("Роль удалена.");
      await refreshRoles(selectedRoleId === roleId ? null : selectedRoleId);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusyAction("");
    }
  };

  const handleDuplicateRole = () => {
    const selectedRole = roles.find((role) => role.id === selectedRoleId);

    if (!selectedRole) {
      return;
    }

    clearFeedback();
    setSelectedRoleId(null);
    setForm({
      name: `${selectedRole.name} копия`,
      permissions: {
        ...getEmptyPermissions(),
        ...selectedRole.permissions
      }
    });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Доступ"
        title="Роли и права доступа"
        description="Задайте, кто управляет пользователями, курсами, отчетами и отделами. Все права применяются отдельно внутри каждой компании."
      />

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

      <div className="grid gap-6 xl:grid-cols-[340px,1fr]">
        <aside className="space-y-4">
          <section className="panel space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-ink">Роли компании</h2>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSelectedRoleId(null);
                  setForm(createEmptyForm());
                }}
              >
                Новая роль
              </button>
            </div>

            <div className="space-y-3">
              {roles.map((role) => {
                const activePermissions = Object.values(role.permissions).filter(Boolean).length;

                return (
                  <button
                    key={role.id}
                    type="button"
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                      selectedRoleId === role.id
                        ? "border-brand-200 bg-brand-50"
                        : "border-slate-200 bg-white hover:border-brand-100"
                    }`}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <p className="font-semibold text-ink">{formatRoleName(role.name)}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Пользователей: {role.usersCount ?? 0} · прав: {activePermissions}
                    </p>
                  </button>
                );
              })}

              {roles.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  Роли еще не созданы.
                </div>
              ) : null}
            </div>
          </section>
        </aside>

        <section className="panel space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-ink">
                {selectedRoleId ? "Редактирование роли" : "Создать роль"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedRoleId
                  ? "Изменения вступят в силу сразу для всех сотрудников с этой ролью."
                  : "Создайте новую комбинацию прав для вашей команды."}
              </p>
            </div>

            {selectedRoleId ? (
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-secondary" onClick={handleDuplicateRole}>
                  Дублировать
                </button>
                <button
                  type="button"
                  className="rounded-full bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                  onClick={() => handleDeleteRole(selectedRoleId)}
                  disabled={busyAction === `delete-${selectedRoleId}`}
                >
                  {busyAction === `delete-${selectedRoleId}` ? "Удаляем..." : "Удалить"}
                </button>
              </div>
            ) : null}
          </div>

          <form className="space-y-5" onSubmit={selectedRoleId ? handleUpdateRole : handleCreateRole}>
            <input
              className="field"
              placeholder="Название роли"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {permissionKeys.map((permission) => (
                <label
                  key={permission}
                  className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(form.permissions[permission])}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        permissions: {
                          ...current.permissions,
                          [permission]: event.target.checked
                        }
                      }))
                    }
                  />
                  {formatPermission(permission)}
                </label>
              ))}
            </div>

            <button className="btn-primary" type="submit" disabled={busyAction === "create" || busyAction === "update"}>
              {busyAction === "create"
                ? "Создаем..."
                : busyAction === "update"
                  ? "Сохраняем..."
                  : selectedRoleId
                    ? "Сохранить роль"
                    : "Создать роль"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

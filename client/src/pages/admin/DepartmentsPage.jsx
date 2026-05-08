import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export function DepartmentsPage() {
  const { token } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    managerId: ""
  });

  const loadData = async () => {
    try {
      const [departmentsResult, usersResult] = await Promise.all([
        apiRequest("/departments", { token }),
        apiRequest("/users", { token })
      ]);

      setDepartments(departmentsResult);
      setUsers(usersResult.filter((user) => user.status === "active"));
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      await apiRequest("/departments", {
        method: "POST",
        token,
        body: {
          name: form.name,
          managerId: form.managerId ? Number(form.managerId) : null
        }
      });

      setForm({ name: "", managerId: "" });
      await loadData();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const handleDelete = async (departmentId) => {
    setError("");

    try {
      await apiRequest(`/departments/${departmentId}`, {
        method: "DELETE",
        token
      });
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Структура компании"
        title="Отделы"
        description="У каждого арендатора собственная оргструктура. Менеджера отдела можно назначить сразу при создании или позже."
      />

      <section className="panel">
        <h2 className="text-xl font-bold text-ink">Создать отдел</h2>
        <form className="mt-5 grid gap-4 md:grid-cols-[1fr,1fr,auto]" onSubmit={handleSubmit}>
          <input
            className="field"
            placeholder="Название отдела"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
          <select
            className="field"
            value={form.managerId}
            onChange={(event) =>
              setForm((current) => ({ ...current, managerId: event.target.value }))
            }
          >
            <option value="">Без руководителя</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <button className="btn-primary" type="submit">
            Сохранить
          </button>
        </form>
        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {departments.map((department) => (
          <article key={department.id} className="panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-ink">{department.name}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Руководитель: {department.manager?.name || "Не назначен"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Сотрудников: {department.membersCount}
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-rose-600"
                onClick={() => handleDelete(department.id)}
              >
                Удалить
              </button>
            </div>
          </article>
        ))}

        {departments.length === 0 ? (
          <div className="panel text-sm text-slate-500">
            Отделы ещё не созданы.
          </div>
        ) : null}
      </section>
    </div>
  );
}

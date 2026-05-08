import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  formatCourseStatus,
  formatDate,
  formatPercent,
  formatRoleName
} from "../../utils/format.js";

export function MyCoursesPage() {
  const { token, socket, hasPermission } = useAuth();
  const canCreateCourses = hasPermission("create_courses");
  const canEditCourses = hasPermission("edit_courses");
  const canDeleteCourses = hasPermission("delete_courses");
  const canManageCourses =
    canCreateCourses ||
    canEditCourses ||
    canDeleteCourses ||
    hasPermission("assign_courses");
  const canAssignCourses = hasPermission("assign_courses");
  const canLoadAssignableUsers =
    canAssignCourses || hasPermission("manage_users") || hasPermission("view_reports");

  const [myCourses, setMyCourses] = useState([]);
  const [companyCourses, setCompanyCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
    status: "draft"
  });
  const [assignForm, setAssignForm] = useState({
    courseId: "",
    userIds: [],
    deadline: ""
  });

  const loadData = async () => {
    try {
      const [myResult, companyResult, usersResult] = await Promise.all([
        apiRequest("/courses/my", { token }),
        canManageCourses ? apiRequest("/courses?scope=company", { token }) : Promise.resolve([]),
        canAssignCourses && canLoadAssignableUsers ? apiRequest("/users", { token }) : Promise.resolve([])
      ]);

      setMyCourses(myResult);
      setCompanyCourses(companyResult);
      setUsers(usersResult.filter((user) => user.status !== "blocked"));
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, canManageCourses, canAssignCourses, canLoadAssignableUsers]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleCoursesChanged = () => {
      loadData();
    };

    socket.on("courses:changed", handleCoursesChanged);
    return () => {
      socket.off("courses:changed", handleCoursesChanged);
    };
  }, [socket, token, canManageCourses, canAssignCourses, canLoadAssignableUsers]);

  const handleCreateCourse = async (event) => {
    event.preventDefault();

    try {
      await apiRequest("/courses", {
        method: "POST",
        token,
        body: courseForm
      });
      setCourseForm({ title: "", description: "", status: "draft" });
      await loadData();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const handleAssignCourse = async (event) => {
    event.preventDefault();

    try {
      await apiRequest("/courses/assign", {
        method: "POST",
        token,
        body: {
          courseId: Number(assignForm.courseId),
          userIds: assignForm.userIds,
          deadline: assignForm.deadline ? new Date(assignForm.deadline).toISOString() : undefined
        }
      });
      setAssignForm({ courseId: "", userIds: [], deadline: "" });
      await loadData();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const handleDeleteCourse = async (courseId) => {
    if (!window.confirm("Удалить курс?")) {
      return;
    }

    try {
      await apiRequest(`/courses/${courseId}`, {
        method: "DELETE",
        token
      });
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const visibleCourses = canManageCourses ? companyCourses : myCourses;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Курсы"
        title={canManageCourses ? "Каталог курсов и назначения" : "Мои курсы и текущий прогресс"}
        description="Здесь легко увидеть активные программы, сроки, прогресс и быстро перейти к следующему полезному действию."
      />

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      {canCreateCourses ? (
        <section className="panel">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-ink">Создать курс</h2>
              <p className="mt-1 text-sm text-slate-500">
                Минимальная форма для быстрого старта, без перегруженного конструктора на первом шаге.
              </p>
            </div>
          </div>

          <form className="mt-6 grid gap-4 md:grid-cols-3" onSubmit={handleCreateCourse}>
            <input
              className="field md:col-span-2"
              placeholder="Название курса"
              value={courseForm.title}
              onChange={(event) => setCourseForm((current) => ({ ...current, title: event.target.value }))}
              required
            />
            <select
              className="field"
              value={courseForm.status}
              onChange={(event) => setCourseForm((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="draft">Черновик</option>
              <option value="published">Опубликован</option>
              <option value="archived">В архиве</option>
            </select>
            <textarea
              className="field md:col-span-3"
              rows="4"
              placeholder="Короткое описание курса"
              value={courseForm.description}
              onChange={(event) => setCourseForm((current) => ({ ...current, description: event.target.value }))}
            />
            <div className="md:col-span-3">
              <button className="btn-primary" type="submit">
                Создать курс
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canAssignCourses ? (
        <section className="panel">
          <div>
            <h2 className="text-2xl font-extrabold text-ink">Назначить курс сотрудникам</h2>
            <p className="mt-1 text-sm text-slate-500">
              Все назначения и дедлайны задаются в одной понятной форме.
            </p>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleAssignCourse}>
            <select
              className="field"
              value={assignForm.courseId}
              onChange={(event) => setAssignForm((current) => ({ ...current, courseId: event.target.value }))}
              required
            >
              <option value="">Выберите курс</option>
              {companyCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-3 rounded-4xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <input
                    type="checkbox"
                    checked={assignForm.userIds.includes(user.id)}
                    onChange={(event) =>
                      setAssignForm((current) => ({
                        ...current,
                        userIds: event.target.checked
                          ? [...current.userIds, user.id]
                          : current.userIds.filter((item) => item !== user.id)
                      }))
                    }
                  />
                  <span className="text-sm text-slate-700">
                    {user.name} · {formatRoleName(user.role?.name)}
                  </span>
                </label>
              ))}
            </div>

            {users.length === 0 ? (
              <div className="rounded-4xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                Нет сотрудников, которым можно назначить курс.
              </div>
            ) : null}

            <label className="block text-sm text-slate-600">
              Дедлайн прохождения
              <input
                className="field mt-2"
                type="datetime-local"
                value={assignForm.deadline}
                onChange={(event) => setAssignForm((current) => ({ ...current, deadline: event.target.value }))}
              />
            </label>

            <button className="btn-primary" type="submit" disabled={users.length === 0}>
              Назначить выбранным сотрудникам
            </button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        {visibleCourses.map((course) => (
          <article key={course.id} className="panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
                  {formatCourseStatus(course.status)}
                </p>
                <h2 className="mt-4 text-2xl font-extrabold text-ink">{course.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {course.description || "Описание пока не добавлено."}
                </p>
              </div>
              <div className="rounded-4xl border border-[#d9cfb7] bg-[linear-gradient(145deg,_rgba(255,251,242,0.96),_rgba(255,241,216,0.9))] px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">Прогресс</p>
                <p className="mt-2 text-2xl font-extrabold text-ink">{formatPercent(course.progressPercent)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-4xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Уроки</p>
                <p className="mt-2 text-xl font-extrabold text-ink">{course.lessonsCount}</p>
              </div>
              <div className="rounded-4xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Модули</p>
                <p className="mt-2 text-xl font-extrabold text-ink">{course.modulesCount}</p>
              </div>
              <div className="rounded-4xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Срок</p>
                <p className="mt-2 text-sm font-bold text-ink">{formatDate(course.myAssignment?.deadline)}</p>
              </div>
            </div>

            {canManageCourses ? (
              <p className="mt-4 text-sm text-slate-500">
                Назначено пользователям: <strong className="text-ink">{course.assignmentCount ?? 0}</strong>
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn-primary" to={`/courses/${course.id}`}>
                Открыть курс
              </Link>
              {canEditCourses ? (
                <Link className="btn-secondary" to={`/courses/${course.id}/editor`}>
                  Конструктор курса
                </Link>
              ) : null}
              {canDeleteCourses ? (
                <button
                  type="button"
                  className="rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  onClick={() => handleDeleteCourse(course.id)}
                >
                  Удалить
                </button>
              ) : null}
            </div>
          </article>
        ))}

        {visibleCourses.length === 0 ? (
          <div className="panel text-sm text-slate-500">
            Пока нет доступных курсов. Этот экран обновится сам, как только появится новое назначение.
          </div>
        ) : null}
      </section>
    </div>
  );
}

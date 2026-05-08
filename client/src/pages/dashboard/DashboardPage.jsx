import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { StatCard } from "../../components/StatCard.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  formatChatStatus,
  formatCourseStatus,
  formatDate,
  formatPercent
} from "../../utils/format.js";

export function DashboardPage() {
  const { company, token, socket, hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const canManageSignature = hasPermission("manage_users") || hasPermission("manage_roles");

  const loadDashboard = async () => {
    try {
      const result = await apiRequest("/dashboard/overview", { token });
      setData(result);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [token]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleRealtimeRefresh = () => {
      loadDashboard();
    };

    socket.on("chat:changed", handleRealtimeRefresh);
    socket.on("courses:changed", handleRealtimeRefresh);

    return () => {
      socket.off("chat:changed", handleRealtimeRefresh);
      socket.off("courses:changed", handleRealtimeRefresh);
    };
  }, [socket, token]);

  if (error) {
    return <div className="panel text-sm text-rose-600">{error}</div>;
  }

  if (!data) {
    return <div className="panel text-sm text-slate-500">Загружаем дашборд...</div>;
  }

  const focusTitle =
    company?.focusTitle ||
    (data.summary.unreadThreads > 0
      ? `Есть ${data.summary.unreadThreads} новых сообщений и ${data.summary.inProgressCourses} активных курсов.`
      : `Сейчас у вас ${data.summary.inProgressCourses} курсов в работе и ${data.summary.completedCourses} уже завершены.`);
  const focusHint =
    company?.focusDescription ||
    (data.summary.unreadThreads > 0
      ? "Сначала разберите новые обращения, затем вернитесь к курсам."
      : "Продолжайте текущие программы и закрывайте запланированные этапы.");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Обзор"
        title="Понятная сводка по обучению и коммуникациям"
        description="Все важное на одном экране: новые сообщения, активные курсы, сертификаты и действия, к которым стоит перейти прямо сейчас."
        action={
          <div className="flex flex-wrap gap-3">
            <Link className="btn-primary" to="/courses">
              Продолжить обучение
            </Link>
            <Link className="btn-secondary" to="/chat">
              Открыть чат
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr,0.75fr]">
        <div className="overflow-hidden rounded-4xl border border-[#d5ddd7] bg-[linear-gradient(135deg,_#10211b_0%,_#0f7a65_52%,_#d98930_100%)] p-7 text-white shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/70">Сегодня в фокусе</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight">
            {focusTitle}
          </h2>
          {focusHint ? <p className="mt-4 max-w-2xl text-sm leading-7 text-white/80">{focusHint}</p> : null}

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Новые сообщения</p>
              <p className="mt-2 text-3xl font-extrabold">{data.communication.unreadThreads}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Открытые диалоги</p>
              <p className="mt-2 text-3xl font-extrabold">{data.communication.openThreads}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Активные курсы</p>
              <p className="mt-2 text-3xl font-extrabold">{data.summary.inProgressCourses}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Назначено курсов" value={data.summary.assignedCourses} hint="Все доступные вам программы" />
          <StatCard label="Завершено" value={data.summary.completedCourses} hint="Курсы, пройденные до конца" />
          <StatCard label="В процессе" value={data.summary.inProgressCourses} hint="Программы, к которым стоит вернуться" />
          <StatCard label="Сертификаты" value={data.summary.certificates} hint="Документы по завершенному обучению" />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-ink">Курсы, требующие внимания</h2>
            </div>
            <Link className="btn-secondary" to="/courses">
              Весь каталог
            </Link>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {data.myCourses.map((course) => (
              <article key={course.id} className="rounded-4xl border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,251,246,0.98),_rgba(243,248,245,0.94))] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-ink">{course.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{formatCourseStatus(course.status)}</p>
                  </div>
                  <span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                    {formatPercent(course.progressPercent)}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {course.description || "Описание будет доступно после настройки курса."}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl bg-white/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Уроки</p>
                    <p className="mt-2 text-lg font-bold text-ink">{course.lessonsCount}</p>
                  </div>
                  <div className="rounded-3xl bg-white/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Завершено</p>
                    <p className="mt-2 text-lg font-bold text-ink">{course.completedLessons}</p>
                  </div>
                </div>
                <Link className="btn-primary mt-5" to={`/courses/${course.id}`}>
                  Открыть курс
                </Link>
              </article>
            ))}

            {data.myCourses.length === 0 ? (
              <div className="rounded-4xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                Пока нет назначенных курсов. Как только они появятся, этот блок обновится автоматически.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <section className="panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-ink">Последние диалоги</h2>
              </div>
              <Link className="btn-secondary" to="/chat">
                Весь чат
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {data.recentThreads.map((thread) => (
                <Link key={thread.id} to="/chat" className="block rounded-4xl border border-slate-200 bg-slate-50 px-5 py-4 transition hover:border-brand-100 hover:bg-white">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-ink">{thread.subject}</p>
                    {thread.unreadCount > 0 ? (
                      <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-bold text-accent-600">
                        {thread.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {thread.counterparties.map((item) => item.name).join(", ") || "Без собеседника"}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    <span>{formatChatStatus(thread.status)}</span>
                    <span>{formatDate(thread.lastMessageAt ?? thread.updatedAt)}</span>
                  </div>
                </Link>
              ))}

              {data.recentThreads.length === 0 ? (
                <div className="rounded-4xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Диалоги появятся здесь после первых обращений.
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-ink">Сертификаты</h2>
              </div>
              <Link className="btn-secondary" to={canManageSignature ? "/settings" : "/certificates"}>
                {canManageSignature ? "Подпись и шаблон" : "Все сертификаты"}
              </Link>
            </div>

            <div className="mt-5 space-y-4">
              {data.certificates.map((certificate) => (
                <div key={certificate.id} className="rounded-4xl border border-[#d9cfb7] bg-[linear-gradient(135deg,_rgba(255,251,241,0.96),_rgba(255,244,219,0.88))] px-5 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-600">Сертификат</p>
                  <p className="mt-3 text-lg font-bold text-ink">{certificate.course.title}</p>
                  <p className="mt-2 text-sm text-slate-600">Выдан {formatDate(certificate.issuedAt)}</p>
                  {certificate.verificationCode ? (
                    <p className="mono mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
                      Код проверки {certificate.verificationCode}
                    </p>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-3">
                    {certificate.certificateUrl ? (
                      <a className="btn-secondary" href={certificate.certificateUrl} target="_blank" rel="noreferrer">
                        Открыть
                      </a>
                    ) : null}
                    {certificate.pdfUrl ? (
                      <a className="btn-primary" href={certificate.pdfUrl} download>
                        Скачать PDF
                      </a>
                    ) : null}
                    {certificate.verificationCode ? (
                      <Link className="btn-secondary" to={`/verify-certificate/${certificate.verificationCode}`}>
                        Проверить
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}

              {data.certificates.length === 0 ? (
                <div className="rounded-4xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                  Сертификаты появятся после полного прохождения курса.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {data.team ? (
          <section className="panel">
            <h2 className="text-2xl font-extrabold text-ink">Сводка по команде</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <StatCard label="Пользователи" value={data.team.totalUsers} />
              <StatCard label="Активные" value={data.team.activeUsers} />
              <StatCard label="Курсы компании" value={data.team.companyCourses} />
              <StatCard label="Просрочено" value={data.team.overdueAssignments} />
            </div>
          </section>
        ) : (
          <section className="panel">
            <h2 className="text-2xl font-extrabold text-ink">Что можно сделать дальше</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Link className="rounded-4xl border border-slate-200 bg-slate-50 p-5 transition hover:border-brand-100 hover:bg-white" to="/courses">
                <p className="text-base font-bold text-ink">Открыть свои курсы</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Вернуться к текущим программам и продолжить обучение.
                </p>
              </Link>
              <Link className="rounded-4xl border border-slate-200 bg-slate-50 p-5 transition hover:border-brand-100 hover:bg-white" to="/chat">
                <p className="text-base font-bold text-ink">Связаться с руководством</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Уточнить задачу, задать вопрос или отправить обратную связь.
                </p>
              </Link>
            </div>
          </section>
        )}

        {data.hr ? (
          <section className="panel">
            <h2 className="text-2xl font-extrabold text-ink">Показатели HR</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <StatCard label="Роли" value={data.hr.rolesCount} />
              <StatCard label="Отделы" value={data.hr.departmentsCount} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

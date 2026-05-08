import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { StatCard } from "../../components/StatCard.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  formatDate,
  formatJobStatus,
  formatPercent,
  formatReportKind
} from "../../utils/format.js";

const reportKindOptions = [
  {
    value: "overview",
    label: "Сводный отчет",
    description: "Общая картина по сотрудникам, отделам, курсам и просроченным назначениям.",
    includes: [
      "статусы сотрудников и курсов",
      "завершение по отделам",
      "самые востребованные курсы"
    ]
  },
  {
    value: "course_progress",
    label: "Прогресс по курсам",
    description: "Нагрузка по каждому курсу: сколько назначений, как идет завершение и где есть просрочки.",
    includes: [
      "статус курса",
      "количество уроков",
      "среднее завершение",
      "просроченные назначения"
    ]
  },
  {
    value: "user_progress",
    label: "Прогресс сотрудников",
    description: "Построчная выгрузка по сотрудникам, назначенным курсам, дедлайнам и текущему статусу.",
    includes: [
      "сотрудник и отдел",
      "курс и дедлайн",
      "процент выполнения",
      "состояние назначения"
    ]
  }
];

const exportOptions = [
  {
    value: "pdf",
    label: "PDF",
    caption: "Презентационный файл для руководства",
    className: "btn-primary"
  },
  {
    value: "csv",
    label: "CSV",
    caption: "Табличная выгрузка для Excel",
    className: "btn-secondary"
  },
  {
    value: "json",
    label: "JSON",
    caption: "Технический формат для интеграций",
    className: "btn-secondary"
  }
];

const getJobKind = (job) => job.result?.kind ?? job.payload?.kind ?? "overview";
const getJobFormat = (job) => job.result?.formatLabel ?? (job.payload?.format ?? "json").toUpperCase();
const getJobReadyAt = (job) => job.result?.generatedAt ?? job.processedAt ?? job.createdAt;

export function ReportsPage() {
  const { token } = useAuth();
  const [report, setReport] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [busyFormat, setBusyFormat] = useState("");
  const [selectedKind, setSelectedKind] = useState("overview");

  const loadData = async () => {
    try {
      const [reportResult, jobsResult] = await Promise.all([
        apiRequest("/reports/summary", { token }),
        apiRequest("/reports/jobs?limit=12", { token })
      ]);

      setReport(reportResult);
      setJobs(jobsResult);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const hasActiveJobs = useMemo(
    () => jobs.some((job) => job.status === "pending" || job.status === "processing"),
    [jobs]
  );

  useEffect(() => {
    if (!hasActiveJobs) {
      return undefined;
    }

    const intervalId = setInterval(loadData, 5000);
    return () => clearInterval(intervalId);
  }, [hasActiveJobs, token]);

  const latestCompletedJob = useMemo(
    () => jobs.find((job) => job.status === "completed" && job.result?.fileUrl),
    [jobs]
  );

  const selectedKindMeta =
    reportKindOptions.find((item) => item.value === selectedKind) ?? reportKindOptions[0];

  const generateReport = async (format) => {
    setBusyFormat(format);
    setError("");

    try {
      await apiRequest("/reports/generate", {
        method: "POST",
        token,
        body: {
          format,
          kind: selectedKind
        }
      });
      await loadData();
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setBusyFormat("");
    }
  };

  if (error && !report) {
    return <div className="panel text-sm text-rose-600">{error}</div>;
  }

  if (!report) {
    return <div className="panel text-sm text-slate-500">Загружаем отчеты...</div>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Аналитика"
        title="Отчеты по обучению"
        action={
          <div className="flex flex-wrap gap-3">
            {exportOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={option.className}
                onClick={() => generateReport(option.value)}
                disabled={Boolean(busyFormat)}
                title={option.caption}
              >
                {busyFormat === option.value ? `Готовим ${option.label}...` : `Экспорт ${option.label}`}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink">Выбор отчета</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Выберите шаблон выгрузки. Файл уйдет в фоновую очередь и появится в истории, как только будет готов.
              </p>
            </div>
            {hasActiveJobs ? (
              <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Есть активные задачи
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {reportKindOptions.map((option) => (
              <label
                key={option.value}
                className={`report-kind-card ${selectedKind === option.value ? "report-kind-card-active" : ""}`}
              >
                <input
                  type="radio"
                  name="report-kind"
                  className="sr-only"
                  value={option.value}
                  checked={selectedKind === option.value}
                  onChange={(event) => setSelectedKind(event.target.value)}
                />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-ink">{option.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{option.description}</p>
                  </div>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
                    {option.value === "overview" ? "KPI" : option.value === "course_progress" ? "Курсы" : "Сотрудники"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {option.includes.map((item) => (
                    <span
                      key={item}
                      className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </label>
            ))}
          </div>
        </div>

        <section className="panel">
          <h2 className="text-xl font-bold text-ink">Последняя готовая выгрузка</h2>
          {latestCompletedJob ? (
            <div className="report-download-card mt-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                    {getJobFormat(latestCompletedJob)}
                  </span>
                  <p className="text-lg font-bold text-ink">
                    {latestCompletedJob.result?.kindLabel ?? formatReportKind(getJobKind(latestCompletedJob))}
                  </p>
                  <p className="text-sm leading-6 text-slate-500">
                    Готов {formatDate(getJobReadyAt(latestCompletedJob))}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <a
                    className="btn-primary"
                    href={latestCompletedJob.result.fileUrl}
                    download={latestCompletedJob.result.fileName ?? true}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Скачать файл
                  </a>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-3xl border border-white/80 bg-white/80 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Файл</p>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {latestCompletedJob.result?.fileName ?? "Готовая выгрузка"}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/80 bg-white/80 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Строк / блоков</p>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {latestCompletedJob.result?.itemCount ?? 0}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/80 bg-white/80 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Шаблон</p>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {latestCompletedJob.result?.kindLabel ?? formatReportKind(getJobKind(latestCompletedJob))}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-300 px-5 py-8 text-sm leading-6 text-slate-500">
              Пока нет готовых выгрузок. Выберите шаблон слева и запустите первый экспорт.
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
            <p className="text-sm font-semibold text-ink">Сейчас выбрано: {selectedKindMeta.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{selectedKindMeta.description}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {selectedKindMeta.includes.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Активные сотрудники"
          value={report.usersByStatus.active ?? 0}
          hint="Пользователи с действующим доступом."
        />
        <StatCard
          label="Приглашенные"
          value={report.usersByStatus.invited ?? 0}
          hint="Еще не завершили первый вход."
        />
        <StatCard
          label="Опубликованные курсы"
          value={report.coursesByStatus.published ?? 0}
          hint="Доступны для назначения и прохождения."
        />
        <StatCard
          label="Просроченные назначения"
          value={report.overdueAssignments}
          hint="Требуют внимания менеджера или HR."
        />
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.85fr,1.15fr]">
        <div className="space-y-6">
          <section className="panel">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-ink">Завершение по отделам</h2>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Средний прогресс
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {report.completionByDepartment.map((department) => (
                <div
                  key={department.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-ink">{department.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Назначений курсов: {department.assignmentCount}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                      {formatPercent(department.averageCompletion)}
                    </span>
                  </div>
                </div>
              ))}
              {report.completionByDepartment.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  По отделам пока нет данных для сравнения.
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-ink">Популярные курсы</h2>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                По назначениям
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {report.topCourses.map((course) => (
                <div
                  key={course.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-ink">{course.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Назначено сотрудникам: {course.assignmentCount}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-600">
                      {formatPercent(course.averageCompletion)}
                    </span>
                  </div>
                </div>
              ))}
              {report.topCourses.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Курсы появятся здесь после первых назначений.
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink">История выгрузок</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Очередь обновляется автоматически, пока есть активные задачи.
              </p>
            </div>
            {hasActiveJobs ? (
              <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Очередь активна
              </span>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {jobs.map((job) => (
              <article key={job.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        {getJobFormat(job)}
                      </span>
                      <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        {formatReportKind(getJobKind(job))}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-ink">Задача #{job.id}</p>
                    <p className="text-sm text-slate-500">
                      Создана {formatDate(job.createdAt)}
                      {job.createdBy?.name ? ` · ${job.createdBy.name}` : ""}
                    </p>
                    {job.result?.fileName ? (
                      <p className="text-sm text-slate-500">{job.result.fileName}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-start gap-3 lg:items-end">
                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {formatJobStatus(job.status)}
                    </span>
                    {job.result?.fileUrl ? (
                      <a
                        className="btn-secondary !px-4 !py-2"
                        href={job.result.fileUrl}
                        download={job.result.fileName ?? true}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Скачать
                      </a>
                    ) : null}
                  </div>
                </div>

                {job.errorMessage ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-600">
                    {job.errorMessage}
                  </div>
                ) : null}
              </article>
            ))}

            {jobs.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                Экспортов еще не было. Запустите первую выгрузку сверху.
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  );
}

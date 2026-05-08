import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  formatCourseStatus,
  formatDate,
  formatLessonType,
  formatPercent
} from "../../utils/format.js";

const getAssetUrl = (value) => {
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return value;
};

const isVideoFile = (value) => /\.(mp4|webm)$/i.test(value ?? "");
const isImageFile = (value) => /\.(png|jpe?g|webp)$/i.test(value ?? "");

export function CourseViewerPage() {
  const { id } = useParams();
  const { token, hasPermission } = useAuth();
  const [course, setCourse] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [savingLessonId, setSavingLessonId] = useState(null);
  const [submittingQuizId, setSubmittingQuizId] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResults, setQuizResults] = useState({});

  const canEditCourses = hasPermission("edit_courses");

  const loadCourse = async () => {
    try {
      const [courseResult, progressResult] = await Promise.all([
        apiRequest(`/courses/${id}`, { token }),
        apiRequest(`/progress/${id}`, { token })
      ]);

      setCourse(courseResult);
      setProgress(progressResult);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadCourse();
  }, [id, token]);

  const completeLesson = async (lessonId) => {
    setSavingLessonId(lessonId);
    setError("");

    try {
      const result = await apiRequest(`/progress/lessons/${lessonId}/complete`, {
        method: "POST",
        token
      });

      setProgress(result);
      await loadCourse();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSavingLessonId(null);
    }
  };

  const updateQuizAnswer = (lessonId, questionId, nextValue) => {
    setQuizAnswers((current) => ({
      ...current,
      [lessonId]: {
        ...(current[lessonId] ?? {}),
        [questionId]: {
          ...(current[lessonId]?.[questionId] ?? { answerIds: [], text: "" }),
          ...nextValue
        }
      }
    }));
  };

  const submitQuiz = async (lesson) => {
    setSubmittingQuizId(lesson.id);
    setError("");

    try {
      const answers = Object.entries(quizAnswers[lesson.id] ?? {}).map(
        ([questionId, answer]) => ({
          questionId: Number(questionId),
          answerIds: answer.answerIds ?? [],
          text: answer.text ?? undefined
        })
      );

      const result = await apiRequest(`/progress/lessons/${lesson.id}/quiz-submit`, {
        method: "POST",
        token,
        body: { answers }
      });

      setQuizResults((current) => ({
        ...current,
        [lesson.id]: result
      }));
      setProgress(result.progress);

      if (result.passed) {
        await loadCourse();
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmittingQuizId(null);
    }
  };

  if (error && !course) {
    return <div className="panel text-sm text-rose-600">{error}</div>;
  }

  if (!course || !progress) {
    return <div className="panel text-sm text-slate-500">Загружаем курс...</div>;
  }

  const certificate = progress.myCertificate;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Просмотр курса"
        title={course.title}
        description={course.description || "Описание пока не добавлено."}
        action={
          canEditCourses ? (
            <Link className="btn-secondary" to={`/courses/${id}/editor`}>
              Открыть конструктор
            </Link>
          ) : null
        }
      />

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Прогресс</p>
          <p className="mt-3 text-4xl font-bold text-ink">
            {formatPercent(progress.myProgress.percentage)}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Пройдено уроков: {progress.myProgress.completedLessons} из{" "}
            {progress.myProgress.totalLessons}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Создан</p>
          <p className="mt-3 text-lg font-semibold text-ink">{formatDate(course.createdAt)}</p>
        </div>
        <div className="panel">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Статус</p>
          <p className="mt-3 text-lg font-semibold text-ink">
            {formatCourseStatus(course.status)}
          </p>
        </div>
      </section>

      {certificate ? (
        <section className="overflow-hidden rounded-[32px] border border-[#d7ccb7] bg-[linear-gradient(145deg,_rgba(255,251,242,0.98),_rgba(244,248,245,0.96)_55%,_rgba(255,239,214,0.92)_100%)] p-6 shadow-panel">
          <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr] xl:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-brand-700">
                Сертификат готов
              </p>
              <h2 className="mt-3 text-2xl font-bold text-ink">
                Курс завершён, документ доступен сразу
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Сертификат уже создан. Его можно открыть, проверить по коду и скачать в PDF.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>Код: {certificate.verificationCode}</span>
                <span>Выдан: {formatDate(certificate.issuedAt)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 rounded-[28px] border border-white/70 bg-white/76 p-4">
              {certificate.certificateUrl ? (
                <a
                  className="btn-secondary"
                  href={certificate.certificateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть сертификат
                </a>
              ) : null}
              {certificate.pdfUrl ? (
                <a className="btn-primary" href={certificate.pdfUrl} download>
                  Скачать PDF
                </a>
              ) : null}
              {certificate.verificationCode ? (
                <Link
                  className="btn-secondary"
                  to={`/verify-certificate/${certificate.verificationCode}`}
                >
                  Проверить
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        {course.modules.map((module) => (
          <div key={module.id} className="panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-brand-700">
                  Модуль {module.orderIndex}
                </p>
                <h2 className="mt-2 text-2xl font-bold text-ink">{module.title}</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {module.lessons.length} уроков
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {module.lessons.map((lesson) => {
                const lessonQuizAnswers = quizAnswers[lesson.id] ?? {};
                const lessonQuizResult = quizResults[lesson.id];
                const lessonFileUrl = getAssetUrl(lesson.fileUrl);
                const lessonVideoUrl = getAssetUrl(lesson.videoUrl);

                return (
                  <article
                    key={lesson.id}
                    className="rounded-3xl border border-slate-200 px-5 py-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="font-semibold text-ink">{lesson.title}</p>
                          <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-600">
                            {formatLessonType(lesson.type)}
                          </span>
                        </div>

                        {lesson.content ? (
                          <p className="text-sm text-slate-600">{lesson.content}</p>
                        ) : null}

                        {lesson.type === "video" && lessonVideoUrl ? (
                          <div className="space-y-3">
                            {isVideoFile(lessonVideoUrl) ? (
                              <video
                                className="w-full max-w-3xl rounded-3xl border border-slate-200"
                                controls
                                src={lessonVideoUrl}
                              />
                            ) : null}
                            <a
                              className="inline-flex text-sm font-semibold text-brand-700"
                              href={lessonVideoUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Открыть видео в новой вкладке
                            </a>
                          </div>
                        ) : null}

                        {lesson.type !== "video" && lessonFileUrl ? (
                          <div className="space-y-3">
                            {isImageFile(lessonFileUrl) ? (
                              <img
                                className="max-w-xl rounded-3xl border border-slate-200"
                                src={lessonFileUrl}
                                alt={lesson.title}
                              />
                            ) : null}
                            <a
                              className="inline-flex text-sm font-semibold text-brand-700"
                              href={lessonFileUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Открыть вложение
                            </a>
                          </div>
                        ) : null}

                        {lesson.quiz ? (
                          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div>
                              <p className="text-base font-semibold text-ink">
                                {lesson.quiz.title}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                Проходной балл: {lesson.quiz.passingScore}%
                                {lesson.quiz.timeLimit
                                  ? ` · Лимит времени: ${lesson.quiz.timeLimit} мин`
                                  : ""}
                              </p>
                            </div>

                            {lesson.quiz.questions.map((question, questionIndex) => (
                              <div
                                key={question.id}
                                className="rounded-3xl border border-slate-200 bg-white p-4"
                              >
                                <p className="font-medium text-ink">
                                  {questionIndex + 1}. {question.question}
                                </p>

                                <div className="mt-3 space-y-3">
                                  {question.type === "text" ? (
                                    <textarea
                                      className="field min-h-[96px]"
                                      placeholder="Введите ответ"
                                      value={lessonQuizAnswers[question.id]?.text ?? ""}
                                      onChange={(event) =>
                                        updateQuizAnswer(lesson.id, question.id, {
                                          text: event.target.value
                                        })
                                      }
                                    />
                                  ) : (
                                    question.answers.map((answer) => {
                                      const selectedIds =
                                        lessonQuizAnswers[question.id]?.answerIds ?? [];
                                      const checked = selectedIds.includes(answer.id);

                                      return (
                                        <label
                                          key={answer.id}
                                          className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                                        >
                                          <input
                                            type={
                                              question.type === "single_choice"
                                                ? "radio"
                                                : "checkbox"
                                            }
                                            name={`lesson-${lesson.id}-question-${question.id}`}
                                            checked={checked}
                                            onChange={(event) =>
                                              updateQuizAnswer(lesson.id, question.id, {
                                                answerIds:
                                                  question.type === "single_choice"
                                                    ? event.target.checked
                                                      ? [answer.id]
                                                      : []
                                                    : event.target.checked
                                                      ? [...selectedIds, answer.id]
                                                      : selectedIds.filter(
                                                          (item) => item !== answer.id
                                                        )
                                              })
                                            }
                                          />
                                          {answer.answer}
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            ))}

                            {lessonQuizResult ? (
                              <div
                                className={`rounded-3xl px-4 py-3 text-sm ${
                                  lessonQuizResult.passed
                                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                              >
                                Результат: {lessonQuizResult.score}% из{" "}
                                {lessonQuizResult.passingScore}%.
                                {lessonQuizResult.passed
                                  ? " Тест пройден, урок засчитан."
                                  : " Тест не пройден, можно попробовать снова."}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex min-w-[180px] flex-col items-start gap-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            lesson.isCompleted
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {lesson.isCompleted ? "Пройден" : "Не пройден"}
                        </span>

                        {!lesson.isCompleted && !lesson.quiz ? (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => completeLesson(lesson.id)}
                            disabled={savingLessonId === lesson.id}
                          >
                            {savingLessonId === lesson.id
                              ? "Сохраняем..."
                              : lesson.type === "assignment"
                                ? "Отметить задание выполненным"
                                : "Отметить как пройденный"}
                          </button>
                        ) : null}

                        {!lesson.isCompleted && lesson.quiz ? (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => submitQuiz(lesson)}
                            disabled={submittingQuizId === lesson.id}
                          >
                            {submittingQuizId === lesson.id
                              ? "Проверяем..."
                              : "Отправить тест"}
                          </button>
                        ) : null}

                        {lesson.isCompleted ? (
                          <p className="text-xs text-slate-500">
                            {formatDate(lesson.completedAt)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}

              {module.lessons.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  В модуле пока нет уроков.
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      {progress.teamProgress?.length ? (
        <section className="panel">
          <h2 className="text-xl font-bold text-ink">Прогресс команды</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3">Пользователь</th>
                  <th className="pb-3">Отдел</th>
                  <th className="pb-3">Завершение</th>
                  <th className="pb-3">Срок</th>
                </tr>
              </thead>
              <tbody>
                {progress.teamProgress.map((row) => (
                  <tr key={row.assignmentId} className="border-t border-slate-100">
                    <td className="py-3 font-medium text-ink">{row.user.name}</td>
                    <td className="py-3 text-slate-500">
                      {row.user.department?.name || "Без отдела"}
                    </td>
                    <td className="py-3 text-slate-600">{formatPercent(row.percentage)}</td>
                    <td className="py-3 text-slate-500">
                      {row.overdue ? "Просрочено" : formatDate(row.deadline)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

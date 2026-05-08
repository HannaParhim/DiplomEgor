import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { formatLessonType } from "../../utils/format.js";

const createEmptyAnswer = (isCorrect = false) => ({
  answer: "",
  isCorrect
});

const createEmptyQuestion = () => ({
  question: "",
  type: "single_choice",
  answers: [createEmptyAnswer(true), createEmptyAnswer(false)]
});

const createEmptyLessonForm = () => ({
  title: "",
  type: "text",
  content: "",
  videoUrl: "",
  fileUrl: "",
  orderIndex: "",
  quiz: {
    title: "",
    passingScore: 70,
    timeLimit: "",
    questions: [createEmptyQuestion()]
  }
});

const mapLessonToForm = (lesson) => ({
  title: lesson.title ?? "",
  type: lesson.type ?? "text",
  content: lesson.content ?? "",
  videoUrl: lesson.videoUrl ?? "",
  fileUrl: lesson.fileUrl ?? "",
  orderIndex: String(lesson.orderIndex ?? ""),
  quiz: lesson.quiz
    ? {
        title: lesson.quiz.title ?? "",
        passingScore: lesson.quiz.passingScore ?? 70,
        timeLimit: lesson.quiz.timeLimit ?? "",
        questions:
          lesson.quiz.questions.map((question) => ({
            question: question.question ?? "",
            type: question.type ?? "single_choice",
            answers:
              question.answers.map((answer) => ({
                answer: answer.answer ?? "",
                isCorrect: Boolean(answer.isCorrect)
              })) || []
          })) || []
      }
    : createEmptyLessonForm().quiz
});

const getAssetUrl = (value) => {
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return value;
};

const prepareQuizPayload = (quiz) => ({
  title: quiz.title.trim(),
  passingScore: Number(quiz.passingScore),
  timeLimit: quiz.timeLimit ? Number(quiz.timeLimit) : undefined,
  questions: quiz.questions.map((question) => ({
    question: question.question.trim(),
    type: question.type,
    answers: question.answers.map((answer) => ({
      answer: answer.answer.trim(),
      isCorrect: Boolean(answer.isCorrect)
    }))
  }))
});

const prepareLessonPayload = (form) => ({
  title: form.title.trim(),
  type: form.type,
  content: form.content.trim() || null,
  videoUrl: form.videoUrl.trim() || null,
  fileUrl: form.fileUrl.trim() || null,
  orderIndex: form.orderIndex ? Number(form.orderIndex) : undefined,
  quiz: form.type === "quiz" ? prepareQuizPayload(form.quiz) : undefined
});

function QuizBuilder({ quiz, onChange }) {
  const updateQuestion = (index, updater) => {
    const nextQuestions = quiz.questions.map((question, questionIndex) =>
      questionIndex === index ? updater(question) : question
    );
    onChange({ ...quiz, questions: nextQuestions });
  };

  const addQuestion = () => {
    onChange({
      ...quiz,
      questions: [...quiz.questions, createEmptyQuestion()]
    });
  };

  const removeQuestion = (index) => {
    onChange({
      ...quiz,
      questions: quiz.questions.filter((_, questionIndex) => questionIndex !== index)
    });
  };

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <input
          className="field md:col-span-2"
          placeholder="Название теста"
          value={quiz.title}
          onChange={(event) => onChange({ ...quiz, title: event.target.value })}
        />
        <input
          className="field"
          type="number"
          min="0"
          max="100"
          placeholder="Проходной балл"
          value={quiz.passingScore}
          onChange={(event) => onChange({ ...quiz, passingScore: event.target.value })}
        />
      </div>

      <input
        className="field"
        type="number"
        min="1"
        placeholder="Лимит времени в минутах (необязательно)"
        value={quiz.timeLimit}
        onChange={(event) => onChange({ ...quiz, timeLimit: event.target.value })}
      />

      <div className="space-y-4">
        {quiz.questions.map((question, questionIndex) => (
          <div key={questionIndex} className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <textarea
                className="field min-h-[96px] flex-1"
                placeholder={`Вопрос ${questionIndex + 1}`}
                value={question.question}
                onChange={(event) =>
                  updateQuestion(questionIndex, (current) => ({
                    ...current,
                    question: event.target.value
                  }))
                }
              />
              <div className="flex w-full flex-col gap-3 md:w-56">
                <select
                  className="field"
                  value={question.type}
                  onChange={(event) =>
                    updateQuestion(questionIndex, (current) => ({
                      ...current,
                      type: event.target.value,
                      answers:
                        event.target.value === "text"
                          ? [createEmptyAnswer(true)]
                          : current.answers.length > 0
                            ? current.answers
                            : [createEmptyAnswer(true), createEmptyAnswer(false)]
                    }))
                  }
                >
                  <option value="single_choice">Один вариант</option>
                  <option value="multiple_choice">Несколько вариантов</option>
                  <option value="text">Текстовый ответ</option>
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => removeQuestion(questionIndex)}
                  disabled={quiz.questions.length === 1}
                >
                  Удалить вопрос
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {question.answers.map((answer, answerIndex) => (
                <div key={answerIndex} className="grid gap-3 md:grid-cols-[1fr,auto,auto]">
                  <input
                    className="field"
                    placeholder={
                      question.type === "text"
                        ? "Правильный текстовый ответ"
                        : `Вариант ответа ${answerIndex + 1}`
                    }
                    value={answer.answer}
                    onChange={(event) =>
                      updateQuestion(questionIndex, (current) => ({
                        ...current,
                        answers: current.answers.map((currentAnswer, currentAnswerIndex) =>
                          currentAnswerIndex === answerIndex
                            ? { ...currentAnswer, answer: event.target.value }
                            : currentAnswer
                        )
                      }))
                    }
                  />
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={answer.isCorrect}
                      onChange={(event) =>
                        updateQuestion(questionIndex, (current) => ({
                          ...current,
                          answers: current.answers.map((currentAnswer, currentAnswerIndex) => {
                            if (currentAnswerIndex !== answerIndex) {
                              return question.type === "single_choice" && event.target.checked
                                ? { ...currentAnswer, isCorrect: false }
                                : currentAnswer;
                            }

                            return {
                              ...currentAnswer,
                              isCorrect: event.target.checked
                            };
                          })
                        }))
                      }
                    />
                    Верный
                  </label>
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
                    onClick={() =>
                      updateQuestion(questionIndex, (current) => ({
                        ...current,
                        answers: current.answers.filter(
                          (_, currentAnswerIndex) => currentAnswerIndex !== answerIndex
                        )
                      }))
                    }
                    disabled={question.answers.length === 1}
                  >
                    Удалить
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  updateQuestion(questionIndex, (current) => ({
                    ...current,
                    answers: [...current.answers, createEmptyAnswer(false)]
                  }))
                }
              >
                Добавить вариант ответа
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn-secondary" onClick={addQuestion}>
        Добавить вопрос
      </button>
    </div>
  );
}

function LessonFields({
  form,
  onChange,
  onUpload,
  uploadingKey,
  uploadPrefix
}) {
  const resourceUrl = form.type === "video" ? form.videoUrl : form.fileUrl;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <input
          className="field md:col-span-2"
          placeholder="Название урока"
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
        />
        <input
          className="field"
          type="number"
          min="0"
          placeholder="Порядок"
          value={form.orderIndex}
          onChange={(event) => onChange({ ...form, orderIndex: event.target.value })}
        />
      </div>

      <select
        className="field"
        value={form.type}
        onChange={(event) =>
          onChange({
            ...form,
            type: event.target.value,
            quiz:
              event.target.value === "quiz" && !form.quiz
                ? createEmptyLessonForm().quiz
                : form.quiz
          })
        }
      >
        <option value="text">Текст</option>
        <option value="video">Видео</option>
        <option value="pdf">PDF / презентация</option>
        <option value="assignment">Задание</option>
        <option value="quiz">Тест</option>
      </select>

      <textarea
        className="field min-h-[120px]"
        placeholder={
          form.type === "assignment"
            ? "Текст задания, критерии, чек-лист, инструкции"
            : "Описание урока, текст материала или пояснения"
        }
        value={form.content}
        onChange={(event) => onChange({ ...form, content: event.target.value })}
      />

      {form.type === "video" ? (
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <input
            className="field"
            placeholder="Ссылка на видео или путь к загруженному файлу"
            value={form.videoUrl}
            onChange={(event) => onChange({ ...form, videoUrl: event.target.value })}
          />
          <label className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="font-medium text-ink">Загрузить видеофайл</span>
            <input
              type="file"
              accept="video/mp4,video/webm"
              onChange={(event) => {
                const [file] = event.target.files ?? [];

                if (file) {
                  onUpload(file, "videoUrl");
                }

                event.target.value = "";
              }}
            />
            {uploadingKey === `${uploadPrefix}-videoUrl` ? <span>Загружаем...</span> : null}
          </label>
        </div>
      ) : null}

      {form.type !== "video" && form.type !== "quiz" ? (
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <input
            className="field"
            placeholder="Ссылка на файл, PDF или доп.материал"
            value={form.fileUrl}
            onChange={(event) => onChange({ ...form, fileUrl: event.target.value })}
          />
          <label className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="font-medium text-ink">Загрузить файл</span>
            <input
              type="file"
              accept=".pdf,.ppt,.pptx,image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const [file] = event.target.files ?? [];

                if (file) {
                  onUpload(file, "fileUrl");
                }

                event.target.value = "";
              }}
            />
            {uploadingKey === `${uploadPrefix}-fileUrl` ? <span>Загружаем...</span> : null}
          </label>
        </div>
      ) : null}

      {resourceUrl ? (
        <a
          className="inline-flex text-sm font-semibold text-brand-700"
          href={getAssetUrl(resourceUrl)}
          target="_blank"
          rel="noreferrer"
        >
          Открыть текущий материал
        </a>
      ) : null}

      {form.type === "quiz" ? (
        <QuizBuilder
          quiz={form.quiz}
          onChange={(nextQuiz) => onChange({ ...form, quiz: nextQuiz })}
        />
      ) : null}
    </div>
  );
}

export function CourseEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [course, setCourse] = useState(null);
  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
    status: "draft"
  });
  const [moduleForm, setModuleForm] = useState({
    title: "",
    orderIndex: ""
  });
  const [moduleDrafts, setModuleDrafts] = useState({});
  const [lessonDrafts, setLessonDrafts] = useState({});
  const [lessonEdits, setLessonEdits] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");

  const canDeleteCourse = hasPermission("delete_courses");

  const hydrateEditorState = (courseResult) => {
    setCourse(courseResult);
    setCourseForm({
      title: courseResult.title ?? "",
      description: courseResult.description ?? "",
      status: courseResult.status ?? "draft"
    });
    setModuleDrafts(
      Object.fromEntries(
        courseResult.modules.map((module) => [
          module.id,
          {
            title: module.title,
            orderIndex: String(module.orderIndex)
          }
        ])
      )
    );
    setLessonDrafts(
      Object.fromEntries(
        courseResult.modules.map((module) => [module.id, createEmptyLessonForm()])
      )
    );
    setLessonEdits(
      Object.fromEntries(
        courseResult.modules.flatMap((module) =>
          module.lessons.map((lesson) => [lesson.id, mapLessonToForm(lesson)])
        )
      )
    );
  };

  const loadCourse = async () => {
    try {
      const courseResult = await apiRequest(`/courses/${id}`, { token });
      hydrateEditorState(courseResult);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadCourse();
  }, [id, token]);

  const setSuccess = (text) => {
    setMessage(text);
    setError("");
  };

  const uploadFile = async (file, applyUrl, targetKey) => {
    setUploadingKey(targetKey);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest("/uploads", {
        method: "POST",
        token,
        body: formData
      });
      applyUrl(result.fileUrl);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploadingKey("");
    }
  };

  const saveCourse = async (event) => {
    event.preventDefault();

    try {
      await apiRequest(`/courses/${id}`, {
        method: "PUT",
        token,
        body: {
          ...courseForm
        }
      });
      await loadCourse();
      setSuccess("Курс обновлён");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const deleteCourse = async () => {
    if (!window.confirm("Удалить курс целиком? Все модули и уроки будут удалены.")) {
      return;
    }

    try {
      await apiRequest(`/courses/${id}`, {
        method: "DELETE",
        token
      });
      navigate("/courses");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const createModule = async (event) => {
    event.preventDefault();

    try {
      await apiRequest(`/courses/${id}/modules`, {
        method: "POST",
        token,
        body: {
          title: moduleForm.title,
          orderIndex: moduleForm.orderIndex ? Number(moduleForm.orderIndex) : undefined
        }
      });
      setModuleForm({ title: "", orderIndex: "" });
      await loadCourse();
      setSuccess("Модуль добавлен");
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const saveModule = async (moduleId) => {
    try {
      const draft = moduleDrafts[moduleId];
      await apiRequest(`/courses/${id}/modules/${moduleId}`, {
        method: "PUT",
        token,
        body: {
          title: draft.title,
          orderIndex: draft.orderIndex ? Number(draft.orderIndex) : undefined
        }
      });
      await loadCourse();
      setSuccess("Модуль обновлён");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const removeModule = async (moduleId) => {
    if (!window.confirm("Удалить модуль вместе со всеми уроками?")) {
      return;
    }

    try {
      await apiRequest(`/courses/${id}/modules/${moduleId}`, {
        method: "DELETE",
        token
      });
      await loadCourse();
      setSuccess("Модуль удалён");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const createLesson = async (moduleId) => {
    try {
      await apiRequest(`/courses/${id}/modules/${moduleId}/lessons`, {
        method: "POST",
        token,
        body: prepareLessonPayload(lessonDrafts[moduleId])
      });
      setLessonDrafts((current) => ({
        ...current,
        [moduleId]: createEmptyLessonForm()
      }));
      await loadCourse();
      setSuccess("Урок добавлен");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const saveLesson = async (moduleId, lessonId) => {
    try {
      await apiRequest(`/courses/${id}/modules/${moduleId}/lessons/${lessonId}`, {
        method: "PUT",
        token,
        body: prepareLessonPayload(lessonEdits[lessonId])
      });
      await loadCourse();
      setSuccess("Урок обновлён");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const removeLesson = async (moduleId, lessonId) => {
    if (!window.confirm("Удалить урок?")) {
      return;
    }

    try {
      await apiRequest(`/courses/${id}/modules/${moduleId}/lessons/${lessonId}`, {
        method: "DELETE",
        token
      });
      await loadCourse();
      setSuccess("Урок удалён");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  if (error && !course) {
    return <div className="panel text-sm text-rose-600">{error}</div>;
  }

  if (!course) {
    return <div className="panel text-sm text-slate-500">Загружаем конструктор курса...</div>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Конструктор курса"
        title={course.title}
        description="Редактируйте карточку курса, структуру модулей, уроки, задания, тесты и прикреплённые материалы."
        action={
          <Link className="btn-secondary" to={`/courses/${id}`}>
            Открыть как сотрудник
          </Link>
        }
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

      <section className="panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink">Основные параметры</h2>
            <p className="mt-1 text-sm text-slate-500">
              Меняйте статус курса, описание и название без потери модулей и прогресса.
            </p>
          </div>
          {canDeleteCourse ? (
            <button type="button" className="text-sm font-semibold text-rose-600" onClick={deleteCourse}>
              Удалить курс
            </button>
          ) : null}
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={saveCourse}>
          <input
            className="field md:col-span-2"
            value={courseForm.title}
            onChange={(event) =>
              setCourseForm((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="Название курса"
            required
          />
          <select
            className="field"
            value={courseForm.status}
            onChange={(event) =>
              setCourseForm((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="draft">Черновик</option>
            <option value="published">Опубликован</option>
            <option value="archived">В архиве</option>
          </select>
          <textarea
            className="field md:col-span-3 min-h-[120px]"
            value={courseForm.description}
            onChange={(event) =>
              setCourseForm((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="Описание курса"
          />
          <div className="md:col-span-3">
            <button className="btn-primary" type="submit">
              Сохранить курс
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="text-xl font-bold text-ink">Добавить модуль</h2>
        <form className="mt-5 grid gap-4 md:grid-cols-[1fr,180px,auto]" onSubmit={createModule}>
          <input
            className="field"
            placeholder="Название модуля"
            value={moduleForm.title}
            onChange={(event) =>
              setModuleForm((current) => ({ ...current, title: event.target.value }))
            }
            required
          />
          <input
            className="field"
            type="number"
            min="0"
            placeholder="Порядок"
            value={moduleForm.orderIndex}
            onChange={(event) =>
              setModuleForm((current) => ({ ...current, orderIndex: event.target.value }))
            }
          />
          <button className="btn-primary" type="submit">
            Добавить модуль
          </button>
        </form>
      </section>

      <section className="space-y-6">
        {course.modules.map((module) => (
          <article key={module.id} className="panel space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-4 md:grid-cols-[1fr,180px]">
                <input
                  className="field"
                  value={moduleDrafts[module.id]?.title ?? ""}
                  onChange={(event) =>
                    setModuleDrafts((current) => ({
                      ...current,
                      [module.id]: {
                        ...current[module.id],
                        title: event.target.value
                      }
                    }))
                  }
                />
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={moduleDrafts[module.id]?.orderIndex ?? ""}
                  onChange={(event) =>
                    setModuleDrafts((current) => ({
                      ...current,
                      [module.id]: {
                        ...current[module.id],
                        orderIndex: event.target.value
                      }
                    }))
                  }
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-secondary" onClick={() => saveModule(module.id)}>
                  Сохранить модуль
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-rose-600"
                  onClick={() => removeModule(module.id)}
                >
                  Удалить модуль
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {module.lessons.map((lesson) => (
                <div key={lesson.id} className="rounded-3xl border border-slate-200 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-brand-700">
                        {formatLessonType(lesson.type)}
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-ink">{lesson.title}</h3>
                    </div>
                    <button
                      type="button"
                      className="text-sm font-semibold text-rose-600"
                      onClick={() => removeLesson(module.id, lesson.id)}
                    >
                      Удалить урок
                    </button>
                  </div>

                  <LessonFields
                    form={lessonEdits[lesson.id] ?? mapLessonToForm(lesson)}
                    onChange={(nextValue) =>
                      setLessonEdits((current) => ({
                        ...current,
                        [lesson.id]: nextValue
                      }))
                    }
                    onUpload={(file, field) =>
                      uploadFile(
                        file,
                        (url) =>
                          setLessonEdits((current) => ({
                            ...current,
                            [lesson.id]: {
                              ...current[lesson.id],
                              [field]: url
                            }
                          })),
                        `lesson-${lesson.id}-${field}`
                      )
                    }
                    uploadingKey={uploadingKey}
                    uploadPrefix={`lesson-${lesson.id}`}
                  />

                  <div className="mt-5">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => saveLesson(module.id, lesson.id)}
                    >
                      Сохранить урок
                    </button>
                  </div>
                </div>
              ))}

              {module.lessons.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  В этом модуле пока нет уроков.
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-lg font-bold text-ink">Добавить новый урок</h3>
              <div className="mt-4">
                <LessonFields
                  form={lessonDrafts[module.id] ?? createEmptyLessonForm()}
                  onChange={(nextValue) =>
                    setLessonDrafts((current) => ({
                      ...current,
                      [module.id]: nextValue
                    }))
                  }
                  onUpload={(file, field) =>
                    uploadFile(
                      file,
                      (url) =>
                        setLessonDrafts((current) => ({
                          ...current,
                          [module.id]: {
                            ...current[module.id],
                            [field]: url
                          }
                        })),
                      `module-${module.id}-${field}`
                    )
                  }
                  uploadingKey={uploadingKey}
                  uploadPrefix={`module-${module.id}`}
                />
              </div>
              <div className="mt-5">
                <button type="button" className="btn-primary" onClick={() => createLesson(module.id)}>
                  Добавить урок
                </button>
              </div>
            </div>
          </article>
        ))}

        {course.modules.length === 0 ? (
          <div className="panel text-sm text-slate-500">
            Модули ещё не добавлены. Создайте первый модуль и наполните его уроками.
          </div>
        ) : null}
      </section>
    </div>
  );
}

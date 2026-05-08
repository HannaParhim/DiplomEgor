export const formatDate = (value) => {
  if (!value) {
    return "Не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
};

export const formatPercent = (value) => `${Math.round(value ?? 0)}%`;

const userStatusMap = {
  active: "Активен",
  blocked: "Заблокирован",
  invited: "Приглашен"
};

const courseStatusMap = {
  draft: "Черновик",
  published: "Опубликован",
  archived: "В архиве"
};

const lessonTypeMap = {
  video: "Видео",
  text: "Текст",
  pdf: "PDF",
  quiz: "Тест",
  assignment: "Задание"
};

const chatStatusMap = {
  open: "Открыт",
  closed: "Закрыт"
};

const chatCategoryMap = {
  question: "Вопрос",
  request: "Запрос",
  feedback: "Обратная связь",
  incident: "Проблема"
};

const jobStatusMap = {
  pending: "В очереди",
  processing: "В работе",
  completed: "Готово",
  failed: "Ошибка"
};

const auditActionMap = {
  "auth.login": "Вход в систему",
  "company.registered": "Регистрация компании",
  "company.settings_updated": "Обновление настроек компании",
  "company.focus_updated": "Обновление фокуса компании",
  "user.created": "Создание пользователя",
  "user.updated": "Обновление пользователя",
  "user.deleted": "Удаление пользователя",
  "user.blocked": "Блокировка пользователя",
  "user.invitation_resent": "Повторная отправка приглашения",
  "user.password_reset": "Сброс пароля сотрудника",
  "user.assignment_added": "Назначение курсов сотруднику",
  "user.assignment_updated": "Обновление назначения курса",
  "user.assignment_removed": "Снятие курса с сотрудника",
  "course.created": "Создание курса",
  "course.updated": "Обновление курса",
  "course.deleted": "Удаление курса",
  "course.module_created": "Создание модуля",
  "course.module_updated": "Обновление модуля",
  "course.module_deleted": "Удаление модуля",
  "course.lesson_created": "Создание урока",
  "course.lesson_updated": "Обновление урока",
  "course.lesson_deleted": "Удаление урока",
  "course.assigned": "Назначение курса",
  "chat.thread_created": "Создание диалога",
  "chat.thread_updated": "Обновление диалога",
  "chat.thread_assignee_changed": "Смена ответственного в чате",
  "chat.thread_status_changed": "Изменение статуса диалога",
  "chat.thread_settings_changed": "Изменение параметров диалога",
  "chat.message_posted": "Новое сообщение",
  "lesson.completed": "Завершение урока",
  "quiz.submitted": "Отправка теста",
  "report.queued": "Постановка отчета в очередь",
  "report.generated": "Генерация отчета",
  "certificate.queued": "Постановка сертификата в очередь",
  "certificate.generated": "Генерация сертификата",
  "certificate.exported": "Выгрузка сертификатов"
};

const permissionMap = {
  manage_users: "Управление пользователями",
  manage_company_focus: "Изменение фокуса компании",
  create_courses: "Создание курсов",
  edit_courses: "Редактирование курсов",
  delete_courses: "Удаление курсов",
  assign_courses: "Назначение курсов",
  view_reports: "Просмотр отчетов",
  manage_roles: "Управление ролями",
  manage_departments: "Управление отделами",
  chat_view_thread_settings: "Просмотр блока параметров диалога",
  chat_upload_attachments: "Вложения в чате",
  chat_manage_thread_settings: "Изменение темы и типа диалога",
  chat_close_threads: "Закрытие и открытие диалогов",
  chat_assign_threads: "Назначение ответственного в чате"
};

const roleNameMap = {
  Administrator: "Администратор",
  Manager: "Менеджер",
  HR: "HR",
  Employee: "Сотрудник",
  Администратор: "Администратор",
  Менеджер: "Менеджер",
  Сотрудник: "Сотрудник"
};

const reportKindMap = {
  overview: "Сводный отчет",
  course_progress: "Прогресс по курсам",
  user_progress: "Прогресс сотрудников"
};

export const formatUserStatus = (value) => userStatusMap[value] ?? value ?? "Не указано";
export const formatCourseStatus = (value) => courseStatusMap[value] ?? value ?? "Не указано";
export const formatLessonType = (value) => lessonTypeMap[value] ?? value ?? "Не указано";
export const formatChatStatus = (value) => chatStatusMap[value] ?? value ?? "Не указано";
export const formatChatCategory = (value) => chatCategoryMap[value] ?? value ?? "Не указано";
export const formatJobStatus = (value) => jobStatusMap[value] ?? value ?? "Не указано";
export const formatAuditAction = (value) => auditActionMap[value] ?? value ?? "Не указано";
export const formatPermission = (value) => permissionMap[value] ?? value;
export const formatRoleName = (value) => roleNameMap[value] ?? value ?? "Без роли";
export const formatReportKind = (value) => reportKindMap[value] ?? value ?? "Отчет";

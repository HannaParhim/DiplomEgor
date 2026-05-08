import { z } from "zod";

const textField = (label, min, max) =>
  z
    .string()
    .trim()
    .min(min, `${label}: минимум ${min} символа.`)
    .max(max, `${label}: максимум ${max} символов.`);

const emailField = (label) =>
  z
    .string()
    .trim()
    .email(`${label}: укажите корректный адрес электронной почты.`)
    .transform((value) => value.toLowerCase());

const uploadUrlField = (label) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value.length === 0 ||
        value.startsWith("/uploads/") ||
        /^https?:\/\//i.test(value),
      `${label}: укажите корректную ссылку или путь из /uploads/.`
    );

const nullableId = z.union([
  z.coerce.number().int().min(1, "Идентификатор должен быть больше нуля."),
  z.null()
]);

const companyDomainSchema = z
  .string()
  .trim()
  .min(2, "Домен компании: минимум 2 символа.")
  .max(64, "Домен компании: максимум 64 символа.")
  .refine(
    (value) => /^[a-z0-9-]+$/i.test(value),
    "Домен компании может содержать только латинские буквы, цифры и дефис."
  )
  .transform((value) => value.toLowerCase());

const statusSchema = z.enum(["active", "blocked", "invited"]);
const courseStatusSchema = z.enum(["draft", "published", "archived"]);
const lessonTypeSchema = z.enum(["video", "text", "pdf", "quiz", "assignment"]);
const quizQuestionTypeSchema = z.enum(["single_choice", "multiple_choice", "text"]);
const chatThreadStatusSchema = z.enum(["open", "closed"]);
const chatThreadCategorySchema = z.enum(["question", "request", "feedback", "incident"]);
const reportFormatSchema = z.enum(["json", "csv", "pdf"]);
const reportKindSchema = z.enum(["overview", "course_progress", "user_progress"]);

export const registerCompanySchema = z.object({
  companyName: textField("Название компании", 2, 120),
  companyDomain: companyDomainSchema,
  adminName: textField("Имя администратора", 2, 120),
  adminEmail: emailField("Почта администратора"),
  adminPassword: textField("Пароль администратора", 8, 128)
});

export const loginSchema = z.object({
  email: emailField("Почта"),
  password: textField("Пароль", 8, 128),
  companyDomain: companyDomainSchema.optional()
});

export const roleCreateSchema = z.object({
  name: textField("Название роли", 2, 100),
  permissions: z.record(z.boolean()).default({})
});

export const roleUpdateSchema = roleCreateSchema.partial();

export const departmentCreateSchema = z.object({
  name: textField("Название отдела", 2, 120),
  managerId: nullableId.optional()
});

export const departmentUpdateSchema = departmentCreateSchema.partial();

export const userCreateSchema = z.object({
  name: textField("Имя сотрудника", 2, 120),
  email: emailField("Почта сотрудника"),
  password: textField("Пароль", 8, 128).optional(),
  roleId: z.coerce.number().int().min(1, "Выберите роль."),
  departmentId: nullableId.optional(),
  position: z
    .string()
    .trim()
    .max(120, "Должность: максимум 120 символов.")
    .optional()
    .nullable(),
  status: statusSchema.optional(),
  sendInvite: z.boolean().optional().default(false)
});

export const userUpdateSchema = z.object({
  name: textField("Имя сотрудника", 2, 120).optional(),
  email: emailField("Почта сотрудника").optional(),
  password: textField("Пароль", 8, 128).optional(),
  roleId: z.coerce.number().int().min(1, "Выберите роль.").optional(),
  departmentId: nullableId.optional(),
  position: z
    .string()
    .trim()
    .max(120, "Должность: максимум 120 символов.")
    .optional()
    .nullable(),
  status: statusSchema.optional()
});

export const userCourseAssignSchema = z.object({
  courseIds: z
    .array(z.coerce.number().int().min(1, "Выберите хотя бы один курс."))
    .min(1, "Выберите хотя бы один курс."),
  deadline: z.string().datetime({ message: "Укажите корректную дату дедлайна." }).optional().nullable()
});

export const userAssignmentUpdateSchema = z.object({
  deadline: z.string().datetime({ message: "Укажите корректную дату дедлайна." }).optional().nullable()
});

export const courseCreateSchema = z.object({
  title: textField("Название курса", 2, 180),
  description: z
    .string()
    .trim()
    .max(5000, "Описание курса: максимум 5000 символов.")
    .optional()
    .nullable(),
  status: courseStatusSchema.optional().default("draft")
});

export const courseUpdateSchema = courseCreateSchema.partial();

export const moduleCreateSchema = z.object({
  title: textField("Название модуля", 2, 180),
  orderIndex: z.coerce.number().int().min(0, "Порядок модуля не может быть отрицательным.").optional()
});

export const moduleUpdateSchema = moduleCreateSchema.partial();

export const quizAnswerSchema = z.object({
  answer: textField("Ответ", 1, 500),
  isCorrect: z.boolean().optional().default(false)
});

export const quizQuestionSchema = z.object({
  question: textField("Вопрос", 2, 1000),
  type: quizQuestionTypeSchema,
  answers: z.array(quizAnswerSchema).default([])
});

export const lessonCreateSchema = z.object({
  title: textField("Название урока", 2, 180),
  content: z
    .string()
    .trim()
    .max(20000, "Содержимое урока: максимум 20000 символов.")
    .optional()
    .nullable(),
  type: lessonTypeSchema,
  videoUrl: uploadUrlField("Ссылка на видео").optional().nullable(),
  fileUrl: z.string().trim().max(255, "Ссылка на файл: максимум 255 символов.").optional().nullable(),
  orderIndex: z.coerce.number().int().min(0, "Порядок урока не может быть отрицательным.").optional(),
  quiz: z
    .object({
      title: textField("Название теста", 2, 180),
      passingScore: z.coerce
        .number()
        .int()
        .min(0, "Проходной балл не может быть меньше 0.")
        .max(100, "Проходной балл не может быть больше 100.")
        .default(70),
      timeLimit: z.coerce.number().int().positive("Лимит времени должен быть больше нуля.").optional(),
      questions: z.array(quizQuestionSchema).default([])
    })
    .optional()
});

export const lessonUpdateSchema = lessonCreateSchema.partial();

export const courseAssignSchema = z.object({
  courseId: z.coerce.number().int().min(1, "Выберите курс."),
  userIds: z
    .array(z.coerce.number().int().min(1, "Укажите корректного сотрудника."))
    .min(1, "Выберите хотя бы одного сотрудника."),
  deadline: z.string().datetime({ message: "Укажите корректную дату дедлайна." }).optional().nullable()
});

export const quizSubmissionSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.coerce.number().int().min(1, "Укажите корректный вопрос."),
        answerIds: z
          .array(z.coerce.number().int().min(1, "Укажите корректный вариант ответа."))
          .default([]),
        text: z.string().trim().max(1000, "Ответ: максимум 1000 символов.").optional().nullable()
      })
    )
    .default([])
});

const chatMessageBaseSchema = z.object({
  content: z.string().trim().max(5000, "Сообщение: максимум 5000 символов.").optional().nullable(),
  attachmentUrl: uploadUrlField("Вложение").optional().nullable()
});

export const chatThreadCreateSchema = chatMessageBaseSchema
  .extend({
    recipientId: z.coerce.number().int().min(1, "Выберите получателя."),
    subject: textField("Тема обращения", 2, 180),
    category: chatThreadCategorySchema.default("question")
  })
  .superRefine((value, context) => {
    if (!value.content?.trim() && !value.attachmentUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Добавьте текст сообщения или вложение.",
        path: ["content"]
      });
    }
  });

export const chatMessageCreateSchema = chatMessageBaseSchema.superRefine((value, context) => {
  if (!value.content?.trim() && !value.attachmentUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Добавьте текст сообщения или вложение.",
      path: ["content"]
    });
  }
});

export const chatThreadUpdateSchema = z.object({
  subject: textField("Тема обращения", 2, 180).optional(),
  category: chatThreadCategorySchema.optional(),
  status: chatThreadStatusSchema.optional(),
  assignedToId: nullableId.optional()
});

export const reportGenerationSchema = z.object({
  format: reportFormatSchema.optional().default("json"),
  kind: reportKindSchema.optional().default("overview")
});

export const companySettingsUpdateSchema = z.object({
  name: textField("Название компании", 2, 120).optional(),
  logo: uploadUrlField("Логотип").optional().nullable(),
  directorName: textField("ФИО директора", 2, 160).optional().nullable(),
  directorTitle: textField("Должность директора", 2, 160).optional().nullable(),
  directorSignatureUrl: uploadUrlField("Подпись директора").optional().nullable(),
  rotateVerificationKey: z.boolean().optional().default(false)
});

export const companyFocusUpdateSchema = z.object({
  focusTitle: textField("Фокус", 2, 120).optional().nullable(),
  focusDescription: textField("Подсказка фокуса", 2, 180).optional().nullable()
});

export const certificateExportSchema = z.object({
  certificateIds: z
    .array(z.coerce.number().int().min(1, "Укажите корректные сертификаты."))
    .min(1, "Выберите хотя бы один сертификат для выгрузки.")
});

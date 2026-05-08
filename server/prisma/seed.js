import prisma from "../database/prisma.js";
import { hashPassword } from "../utils/password.js";
import {
  administratorPermissions,
  employeePermissions,
  hrPermissions,
  managerPermissions,
  toPermissionJson
} from "../utils/permissions.js";

const DEMO_DOMAIN = "acme-demo";

const roleDefinitions = [
  {
    name: "Администратор",
    legacyNames: ["Administrator"],
    permissions: administratorPermissions
  },
  {
    name: "Менеджер",
    legacyNames: ["Manager"],
    permissions: managerPermissions
  },
  {
    name: "HR",
    legacyNames: [],
    permissions: hrPermissions
  },
  {
    name: "Сотрудник",
    legacyNames: ["Employee"],
    permissions: employeePermissions
  }
];

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);
const daysAhead = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const ensureRole = async (companyId, definition) => {
  const roles = await prisma.role.findMany({
    where: {
      companyId,
      OR: [{ name: definition.name }, ...definition.legacyNames.map((name) => ({ name }))]
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  const targetRole = roles.find((role) => role.name === definition.name);
  const legacyRole = roles.find((role) => definition.legacyNames.includes(role.name));

  if (targetRole && legacyRole && targetRole.id !== legacyRole.id) {
    await prisma.user.updateMany({
      where: {
        companyId,
        roleId: legacyRole.id
      },
      data: {
        roleId: targetRole.id
      }
    });

    await prisma.role.delete({
      where: { id: legacyRole.id }
    });

    return prisma.role.update({
      where: { id: targetRole.id },
      data: {
        permissions: toPermissionJson(definition.permissions)
      }
    });
  }

  if (targetRole || legacyRole) {
    const role = targetRole ?? legacyRole;

    return prisma.role.update({
      where: { id: role.id },
      data: {
        name: definition.name,
        permissions: toPermissionJson(definition.permissions)
      }
    });
  }

  return prisma.role.create({
    data: {
      companyId,
      name: definition.name,
      permissions: toPermissionJson(definition.permissions)
    }
  });
};

const ensureDepartment = async (companyId) => {
  const departments = await prisma.department.findMany({
    where: {
      companyId,
      OR: [{ name: "Разработка" }, { name: "Engineering" }]
    },
    orderBy: {
      id: "asc"
    }
  });

  const targetDepartment = departments.find((department) => department.name === "Разработка");
  const legacyDepartment = departments.find((department) => department.name === "Engineering");

  if (targetDepartment && legacyDepartment && targetDepartment.id !== legacyDepartment.id) {
    await prisma.user.updateMany({
      where: {
        companyId,
        departmentId: legacyDepartment.id
      },
      data: {
        departmentId: targetDepartment.id
      }
    });

    await prisma.department.delete({
      where: { id: legacyDepartment.id }
    });

    return prisma.department.update({
      where: { id: targetDepartment.id },
      data: {
        name: "Разработка"
      }
    });
  }

  if (targetDepartment || legacyDepartment) {
    const department = targetDepartment ?? legacyDepartment;

    return prisma.department.update({
      where: { id: department.id },
      data: {
        name: "Разработка"
      }
    });
  }

  return prisma.department.create({
    data: {
      companyId,
      name: "Разработка"
    }
  });
};

const upsertUser = async ({
  companyId,
  email,
  name,
  password,
  roleId,
  departmentId = null,
  position = null
}) =>
  prisma.user.upsert({
    where: {
      companyId_email: {
        companyId,
        email
      }
    },
    update: {
      name,
      passwordHash: await hashPassword(password),
      roleId,
      departmentId,
      position,
      status: "active"
    },
    create: {
      companyId,
      email,
      name,
      passwordHash: await hashPassword(password),
      roleId,
      departmentId,
      position,
      status: "active"
    }
  });

const ensureCourse = async ({
  companyId,
  title,
  legacyTitles = [],
  description,
  createdBy,
  status
}) => {
  const existingCourse = await prisma.course.findFirst({
    where: {
      companyId,
      OR: [{ title }, ...legacyTitles.map((legacyTitle) => ({ title: legacyTitle }))]
    }
  });

  if (existingCourse) {
    return prisma.course.update({
      where: { id: existingCourse.id },
      data: {
        title,
        description,
        createdBy,
        status
      }
    });
  }

  return prisma.course.create({
    data: {
      companyId,
      title,
      description,
      createdBy,
      status
    }
  });
};

const ensureModule = async (courseId, orderIndex, title) =>
  prisma.courseModule.upsert({
    where: {
      courseId_orderIndex: {
        courseId,
        orderIndex
      }
    },
    update: {
      title
    },
    create: {
      courseId,
      title,
      orderIndex
    }
  });

const buildQuizData = (quiz) => ({
  title: quiz.title,
  passingScore: quiz.passingScore,
  timeLimit: quiz.timeLimit ?? null,
  questions: {
    deleteMany: {},
    create: quiz.questions.map((question) => ({
      question: question.question,
      type: question.type,
      answers: {
        create: question.answers.map((answer) => ({
          answer: answer.answer,
          isCorrect: answer.isCorrect
        }))
      }
    }))
  }
});

const ensureLesson = async ({
  moduleId,
  orderIndex,
  title,
  content = null,
  type,
  videoUrl = null,
  fileUrl = null,
  quiz = null
}) =>
  prisma.$transaction(async (tx) => {
    const lesson = await tx.lesson.upsert({
      where: {
        moduleId_orderIndex: {
          moduleId,
          orderIndex
        }
      },
      update: {
        title,
        content,
        type,
        videoUrl,
        fileUrl
      },
      create: {
        moduleId,
        orderIndex,
        title,
        content,
        type,
        videoUrl,
        fileUrl
      },
      include: {
        quiz: true
      }
    });

    if (type === "quiz" && quiz) {
      await tx.quiz.upsert({
        where: {
          lessonId: lesson.id
        },
        create: {
          lessonId: lesson.id,
          title: quiz.title,
          passingScore: quiz.passingScore,
          timeLimit: quiz.timeLimit ?? null,
          questions: {
            create: quiz.questions.map((question) => ({
              question: question.question,
              type: question.type,
              answers: {
                create: question.answers.map((answer) => ({
                  answer: answer.answer,
                  isCorrect: answer.isCorrect
                }))
              }
            }))
          }
        },
        update: buildQuizData(quiz)
      });
    } else if (lesson.quiz) {
      await tx.quiz.delete({
        where: {
          id: lesson.quiz.id
        }
      });
    }

    return tx.lesson.findUnique({
      where: {
        id: lesson.id
      }
    });
  });

const ensureDemoThread = async ({
  companyId,
  subject,
  category,
  status,
  createdById,
  assignedToId,
  participants,
  messages
}) => {
  const existingThread = await prisma.chatThread.findFirst({
    where: {
      companyId,
      subject
    }
  });

  return prisma.$transaction(async (tx) => {
    const thread = existingThread
      ? await tx.chatThread.update({
          where: { id: existingThread.id },
          data: {
            category,
            status,
            createdById,
            assignedToId,
            lastMessageAt: messages[messages.length - 1]?.createdAt ?? new Date()
          }
        })
      : await tx.chatThread.create({
          data: {
            companyId,
            subject,
            category,
            status,
            createdById,
            assignedToId,
            lastMessageAt: messages[messages.length - 1]?.createdAt ?? new Date()
          }
        });

    await tx.chatThreadParticipant.deleteMany({
      where: {
        threadId: thread.id
      }
    });

    await tx.chatMessage.deleteMany({
      where: {
        threadId: thread.id
      }
    });

    await tx.chatThreadParticipant.createMany({
      data: participants.map((participant) => ({
        threadId: thread.id,
        userId: participant.userId,
        lastReadAt: participant.lastReadAt ?? null,
        createdAt: participant.createdAt ?? new Date()
      }))
    });

    await tx.chatMessage.createMany({
      data: messages.map((message) => ({
        threadId: thread.id,
        senderId: message.senderId,
        content: message.content,
        attachmentUrl: message.attachmentUrl ?? null,
        createdAt: message.createdAt ?? new Date()
      }))
    });

    return tx.chatThread.update({
      where: {
        id: thread.id
      },
      data: {
        status,
        assignedToId,
        lastMessageAt: messages[messages.length - 1]?.createdAt ?? new Date()
      }
    });
  });
};

async function seed() {
  const company = await prisma.company.upsert({
    where: { domain: DEMO_DOMAIN },
    update: {
      name: "Демо-компания",
      focusTitle: "Завершить обязательные курсы этой недели",
      focusDescription: "Следите за новыми сообщениями и закрывайте активные назначения без просрочек.",
      directorName: "Анна Белова",
      directorTitle: "Генеральный директор"
    },
    create: {
      name: "Демо-компания",
      domain: DEMO_DOMAIN,
      focusTitle: "Завершить обязательные курсы этой недели",
      focusDescription: "Следите за новыми сообщениями и закрывайте активные назначения без просрочек.",
      directorName: "Анна Белова",
      directorTitle: "Генеральный директор"
    }
  });

  const roles = Object.fromEntries(
    await Promise.all(
      roleDefinitions.map(async (definition) => [
        definition.name,
        await ensureRole(company.id, definition)
      ])
    )
  );

  const department = await ensureDepartment(company.id);

  const admin = await upsertUser({
    companyId: company.id,
    email: "admin@acme.test",
    name: "Системный администратор",
    password: "Admin12345!",
    roleId: roles["Администратор"].id,
    departmentId: department.id,
    position: "Администратор LMS"
  });

  const manager = await upsertUser({
    companyId: company.id,
    email: "manager@acme.test",
    name: "Руководитель команды",
    password: "Manager12345!",
    roleId: roles["Менеджер"].id,
    departmentId: department.id,
    position: "Менеджер разработки"
  });

  const employee = await upsertUser({
    companyId: company.id,
    email: "employee@acme.test",
    name: "Новый сотрудник",
    password: "Employee12345!",
    roleId: roles["Сотрудник"].id,
    departmentId: department.id,
    position: "Инженер-программист"
  });

  await upsertUser({
    companyId: company.id,
    email: "hr@acme.test",
    name: "HR-партнер",
    password: "Hr12345!",
    roleId: roles.HR.id,
    position: "HR-партнер"
  });

  await prisma.department.update({
    where: { id: department.id },
    data: {
      managerId: manager.id
    }
  });

  const onboardingCourse = await ensureCourse({
    companyId: company.id,
    title: "Основы адаптации",
    legacyTitles: ["Onboarding Basics"],
    description:
      "Базовый курс о компании, процессах, правилах работы и ключевых каналах коммуникации.",
    createdBy: admin.id,
    status: "published"
  });

  const onboardingModule = await ensureModule(onboardingCourse.id, 1, "Добро пожаловать");

  const onboardingLesson = await ensureLesson({
    moduleId: onboardingModule.id,
    orderIndex: 1,
    title: "Обзор компании",
    content:
      "Узнайте, как устроена компания, кто за что отвечает и куда обращаться по рабочим вопросам.",
    type: "text"
  });

  await prisma.courseAssignment.upsert({
    where: {
      courseId_userId: {
        courseId: onboardingCourse.id,
        userId: employee.id
      }
    },
    update: {
      assignedBy: manager.id,
      deadline: null
    },
    create: {
      courseId: onboardingCourse.id,
      userId: employee.id,
      assignedBy: manager.id
    }
  });

  await prisma.progress.upsert({
    where: {
      userId_lessonId: {
        userId: employee.id,
        lessonId: onboardingLesson.id
      }
    },
    update: {
      completed: true,
      completedAt: new Date()
    },
    create: {
      userId: employee.id,
      lessonId: onboardingLesson.id,
      completed: true,
      completedAt: new Date()
    }
  });

  await prisma.certificate.upsert({
    where: {
      userId_courseId: {
        userId: employee.id,
        courseId: onboardingCourse.id
      }
    },
    update: {},
    create: {
      userId: employee.id,
      courseId: onboardingCourse.id,
      certificateUrl: null
    }
  });

  const practiceCourse = await ensureCourse({
    companyId: company.id,
    title: "Практика в рабочих системах",
    description:
      "Практический курс с видео, заданием и тестом по рабочим инструментам и стандартам коммуникации.",
    createdBy: manager.id,
    status: "published"
  });

  const practiceModule = await ensureModule(practiceCourse.id, 1, "Стартовые инструменты");

  const practiceVideoLesson = await ensureLesson({
    moduleId: practiceModule.id,
    orderIndex: 1,
    title: "Видео-обзор рабочих сервисов",
    content:
      "Короткий обзор LMS, корпоративного мессенджера, CRM и правил постановки задач.",
    type: "video",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4"
  });

  await ensureLesson({
    moduleId: practiceModule.id,
    orderIndex: 2,
    title: "Задание: подготовить рабочий план",
    content:
      "Сформируйте список рабочих систем, к которым вам нужен доступ, и опишите план первой недели.",
    type: "assignment",
    fileUrl: null
  });

  await ensureLesson({
    moduleId: practiceModule.id,
    orderIndex: 3,
    title: "Проверка знаний по коммуникации",
    content: "Ответьте на несколько вопросов по рабочим правилам и каналам связи.",
    type: "quiz",
    quiz: {
      title: "Тест по рабочим процессам",
      passingScore: 70,
      timeLimit: 15,
      questions: [
        {
          question: "Куда сотрудник пишет по вопросам доступа и организационным запросам?",
          type: "single_choice",
          answers: [
            { answer: "В чат с руководством внутри LMS", isCorrect: true },
            { answer: "В случайный личный мессенджер", isCorrect: false },
            { answer: "Только по телефону", isCorrect: false }
          ]
        },
        {
          question: "Что должно быть в хорошем рабочем запросе?",
          type: "multiple_choice",
          answers: [
            { answer: "Краткое описание задачи", isCorrect: true },
            { answer: "Желаемый срок", isCorrect: true },
            { answer: "Контекст и ожидаемый результат", isCorrect: true },
            { answer: "Набор случайных сообщений без темы", isCorrect: false }
          ]
        }
      ]
    }
  });

  await prisma.courseAssignment.upsert({
    where: {
      courseId_userId: {
        courseId: practiceCourse.id,
        userId: employee.id
      }
    },
    update: {
      assignedBy: manager.id,
      deadline: daysAhead(7)
    },
    create: {
      courseId: practiceCourse.id,
      userId: employee.id,
      assignedBy: manager.id,
      deadline: daysAhead(7)
    }
  });

  await prisma.progress.upsert({
    where: {
      userId_lessonId: {
        userId: employee.id,
        lessonId: practiceVideoLesson.id
      }
    },
    update: {
      completed: true,
      completedAt: hoursAgo(6)
    },
    create: {
      userId: employee.id,
      lessonId: practiceVideoLesson.id,
      completed: true,
      completedAt: hoursAgo(6)
    }
  });

  await ensureDemoThread({
    companyId: company.id,
    subject: "Старт в первой неделе",
    category: "feedback",
    status: "open",
    createdById: manager.id,
    assignedToId: manager.id,
    participants: [
      {
        userId: manager.id,
        lastReadAt: new Date()
      },
      {
        userId: employee.id,
        lastReadAt: hoursAgo(18)
      }
    ],
    messages: [
      {
        senderId: manager.id,
        content:
          "Добро пожаловать в команду. В этом диалоге я буду фиксировать стартовые задачи и отвечать на организационные вопросы.",
        createdAt: hoursAgo(14)
      },
      {
        senderId: manager.id,
        content:
          "Проверь, пожалуйста, что тебе видны оба курса и доступен чат. Если чего-то не хватает, ответь прямо здесь.",
        createdAt: hoursAgo(2)
      }
    ]
  });

  await ensureDemoThread({
    companyId: company.id,
    subject: "Нужен доступ к CRM",
    category: "request",
    status: "open",
    createdById: employee.id,
    assignedToId: manager.id,
    participants: [
      {
        userId: employee.id,
        lastReadAt: new Date()
      },
      {
        userId: manager.id,
        lastReadAt: hoursAgo(5)
      }
    ],
    messages: [
      {
        senderId: employee.id,
        content:
          "Не вижу доступ к CRM. Подскажи, пожалуйста, нужно ли мне оформить отдельный запрос или доступ выдастся автоматически?",
        createdAt: hoursAgo(4)
      }
    ]
  });
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

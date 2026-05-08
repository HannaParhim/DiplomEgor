import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import prisma from "../database/prisma.js";
import config from "../config/index.js";
import { enqueueBackgroundJob, listBackgroundJobs } from "./backgroundJobService.js";
import { getDetailedReport, getReportSummary } from "./reportService.js";
import { recordAuditEvent } from "./auditService.js";
import {
  ensureDirectory,
  sanitizeFileName,
  writeJsonFile,
  writeTextFile
} from "../utils/storage.js";

export const REPORT_GENERATION_JOB_TYPE = "report_generation";

const REPORT_KINDS = {
  overview: {
    slug: "overview",
    title: "Сводный отчет по обучению",
    description: "Общая картина по сотрудникам, курсам, отделам и просроченным назначениям."
  },
  course_progress: {
    slug: "course-progress",
    title: "Отчет по прогрессу курсов",
    description: "Нагрузка по курсам, завершение, количество назначений и просрочки."
  },
  user_progress: {
    slug: "user-progress",
    title: "Отчет по прогрессу сотрудников",
    description: "Назначения, дедлайны и текущее выполнение по каждому сотруднику."
  }
};

const REPORT_FORMATS = {
  json: {
    extension: "json",
    label: "JSON",
    contentType: "application/json"
  },
  csv: {
    extension: "csv",
    label: "CSV",
    contentType: "text/csv"
  },
  pdf: {
    extension: "pdf",
    label: "PDF",
    contentType: "application/pdf"
  }
};

const USER_STATUS_LABELS = {
  active: "Активен",
  blocked: "Заблокирован",
  invited: "Приглашен"
};

const COURSE_STATUS_LABELS = {
  draft: "Черновик",
  published: "Опубликован",
  archived: "В архиве"
};

const CSV_SEPARATOR = ";";
const CSV_BOM = "\uFEFF";

const resolveExistingFont = (candidates) => candidates.find((candidate) => fs.existsSync(candidate));

const getPdfFonts = () => {
  const windir = process.env.WINDIR ?? "C:\\Windows";
  const fontsDir = path.join(windir, "Fonts");

  return {
    regular: resolveExistingFont([
      path.join(fontsDir, "arial.ttf"),
      path.join(fontsDir, "segoeui.ttf"),
      path.join(fontsDir, "calibri.ttf")
    ]),
    bold: resolveExistingFont([
      path.join(fontsDir, "arialbd.ttf"),
      path.join(fontsDir, "segoeuib.ttf"),
      path.join(fontsDir, "calibrib.ttf")
    ])
  };
};

const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(value))
    : "Не указано";

const formatDateOnly = (value) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium"
      }).format(new Date(value))
    : "Не указано";

const formatPercent = (value) => `${Math.round(value ?? 0)}%`;

const formatUserStatus = (value) => USER_STATUS_LABELS[value] ?? value ?? "Не указано";

const formatCourseStatus = (value) => COURSE_STATUS_LABELS[value] ?? value ?? "Не указано";

const formatAssignmentStatus = (item) => {
  if (item.progressPercent >= 100) {
    return "Завершено";
  }

  if (item.overdue) {
    return "Просрочено";
  }

  return "В работе";
};

const normalizeSpaces = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeCsvCell = (value) => {
  const normalizedValue = normalizeSpaces(value).replace(/"/g, "\"\"");
  const safeValue = /^[=+\-@]/.test(normalizedValue) ? `'${normalizedValue}` : normalizedValue;
  return `"${safeValue}"`;
};

const buildCsv = (rows) =>
  `${CSV_BOM}${rows.map((row) => row.map(sanitizeCsvCell).join(CSV_SEPARATOR)).join("\r\n")}`;

const toCsv = (kind, report) => {
  const meta = [
    ["Компания", report.company.name],
    ["Домен", report.company.domain],
    ["Тип отчета", getReportKindMeta(kind).title],
    ["Сформирован", formatDateTime(report.generatedAt)]
  ];

  if (kind === "course_progress") {
    return buildCsv([
      ...meta,
      [],
      [
        "Курс",
        "Статус",
        "Уроков",
        "Назначений",
        "Среднее завершение",
        "Просроченных назначений"
      ],
      ...report.items.map((course) => [
        course.title,
        formatCourseStatus(course.status),
        course.lessonsCount,
        course.assignmentCount,
        formatPercent(course.averageCompletion),
        course.overdueAssignments
      ])
    ]);
  }

  if (kind === "user_progress") {
    return buildCsv([
      ...meta,
      [],
      [
        "Сотрудник",
        "Почта",
        "Статус",
        "Отдел",
        "Курс",
        "Прогресс",
        "Уроков завершено",
        "Всего уроков",
        "Назначено",
        "Дедлайн",
        "Состояние"
      ],
      ...report.items.map((item) => [
        item.userName,
        item.userEmail,
        formatUserStatus(item.userStatus),
        item.departmentName,
        item.courseTitle,
        formatPercent(item.progressPercent),
        item.completedLessons,
        item.totalLessons,
        formatDateTime(item.assignedAt),
        formatDateOnly(item.deadline),
        formatAssignmentStatus(item)
      ])
    ]);
  }

  return buildCsv([
    ...meta,
    [],
    ["Метрика", "Значение"],
    ["Активные сотрудники", report.summary.usersByStatus.active ?? 0],
    ["Приглашенные сотрудники", report.summary.usersByStatus.invited ?? 0],
    ["Заблокированные сотрудники", report.summary.usersByStatus.blocked ?? 0],
    ["Опубликованные курсы", report.summary.coursesByStatus.published ?? 0],
    ["Черновики", report.summary.coursesByStatus.draft ?? 0],
    ["Архивные курсы", report.summary.coursesByStatus.archived ?? 0],
    ["Просроченные назначения", report.summary.overdueAssignments ?? 0],
    [],
    ["Отдел", "Назначений", "Среднее завершение"],
    ...report.summary.completionByDepartment.map((department) => [
      department.name,
      department.assignmentCount,
      formatPercent(department.averageCompletion)
    ]),
    [],
    ["Курс", "Назначений", "Среднее завершение"],
    ...report.summary.topCourses.map((course) => [
      course.title,
      course.assignmentCount,
      formatPercent(course.averageCompletion)
    ])
  ]);
};

const truncateText = (value, maxLength = 48) => {
  const normalized = normalizeSpaces(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const drawRoundedLabel = (
  doc,
  { x, y, width, height = 54, label, value, tone = "green", regularFont, boldFont }
) => {
  const tones = {
    green: {
      background: "#eef8f4",
      label: "#6d7b76",
      value: "#0f7a65"
    },
    amber: {
      background: "#fff6e8",
      label: "#8b6b2e",
      value: "#b45309"
    },
    slate: {
      background: "#f3f6f5",
      label: "#6d7b76",
      value: "#10211b"
    }
  };

  const palette = tones[tone] ?? tones.green;

  doc.save();
  doc.roundedRect(x, y, width, height, 18).fill(palette.background);
  doc.fillColor(palette.label).font(regularFont).fontSize(9).text(label, x + 16, y + 12, {
    width: width - 32,
    characterSpacing: 1.2
  });
  doc
    .fillColor(palette.value)
    .font(boldFont)
    .fontSize(18)
    .text(value, x + 16, y + 27, {
      width: width - 32
    });
  doc.restore();
};

const drawHeader = (doc, { company, reportTitle, subtitle, generatedAt, regularFont, boldFont }) => {
  doc.save();
  doc.roundedRect(36, 30, doc.page.width - 72, 110, 28).fill("#10211b");
  doc.roundedRect(54, 48, 56, 56, 18).fill("#0f7a65");
  doc
    .fillColor("#ffffff")
    .font(boldFont)
    .fontSize(26)
    .text((company.name || "C").slice(0, 1).toUpperCase(), 54, 63, {
      width: 56,
      align: "center"
    });
  doc.fillColor("#a7c7be").font(regularFont).fontSize(10).text("КОРПОРАТИВНАЯ ПЛАТФОРМА", 130, 52, {
    characterSpacing: 2
  });
  doc.fillColor("#ffffff").font(boldFont).fontSize(24).text(reportTitle, 130, 72, {
    width: doc.page.width - 280
  });
  doc.fillColor("#d8ede6").font(regularFont).fontSize(11).text(subtitle, 130, 104, {
    width: doc.page.width - 280
  });
  doc
    .fillColor("#f4c074")
    .font(boldFont)
    .fontSize(11)
    .text("СФОРМИРОВАН", doc.page.width - 210, 52, {
      width: 130,
      align: "right",
      characterSpacing: 1.6
    });
  doc.fillColor("#ffffff").font(regularFont).fontSize(11).text(formatDateTime(generatedAt), doc.page.width - 230, 72, {
    width: 150,
    align: "right"
  });
  doc.fillColor("#c3d0cb").font(regularFont).fontSize(10).text(company.name, doc.page.width - 230, 94, {
    width: 150,
    align: "right"
  });
  doc.restore();
};

const drawTableHeader = (doc, columns, y, boldFont) => {
  let x = 40;
  columns.forEach((column) => {
    doc.roundedRect(x, y, column.width, 26, 10).fill("#eef4ef");
    doc
      .fillColor("#5f6f69")
      .font(boldFont)
      .fontSize(9)
      .text(column.label, x + 10, y + 8, {
        width: column.width - 20,
        align: column.align ?? "left"
      });
    x += column.width + 8;
  });
};

const drawTableRows = (
  doc,
  { columns, rows, startY, bottomY, onPageBreak, regularFont }
) => {
  let y = startY;

  rows.forEach((row, rowIndex) => {
    if (y + 28 > bottomY) {
      onPageBreak();
      y = startY;
    }

    let x = 40;
    const background = rowIndex % 2 === 0 ? "#ffffff" : "#f8fbf9";

    columns.forEach((column) => {
      doc.roundedRect(x, y, column.width, 30, 12).fill(background);
      doc
        .fillColor("#10211b")
        .font(regularFont)
        .fontSize(10)
        .text(truncateText(row[column.key], column.truncate ?? 60), x + 10, y + 9, {
          width: column.width - 20,
          align: column.align ?? "left"
        });
      x += column.width + 8;
    });

    y += 36;
  });

  return y;
};

async function writePdfReport(filePath, report) {
  await ensureDirectory(path.dirname(filePath));

  const meta = getReportKindMeta(report.kind);
  const fonts = getPdfFonts();
  const layout = report.kind === "overview" ? "portrait" : "landscape";

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    const doc = new PDFDocument({
      size: "A4",
      layout,
      margin: 0,
      info: {
        Title: meta.title,
        Author: report.company.name,
        Subject: "Отчет по обучению"
      }
    });

    doc.on("error", reject);
    stream.on("error", reject);
    stream.on("finish", () => resolve(filePath));
    doc.pipe(stream);

    const regularFont = fonts.regular ? "LmsRegular" : "Helvetica";
    const boldFont = fonts.bold ? "LmsBold" : "Helvetica-Bold";

    if (fonts.regular) {
      doc.registerFont("LmsRegular", fonts.regular);
    }

    if (fonts.bold) {
      doc.registerFont("LmsBold", fonts.bold);
    }

    doc.font(regularFont);

    let pageNumber = 1;
    const startPage = (sectionTitle) => {
      if (pageNumber > 1) {
        doc.addPage({ size: "A4", layout, margin: 0 });
      }

      doc.font(regularFont);
      drawHeader(doc, {
        company: report.company,
        reportTitle: meta.title,
        subtitle: sectionTitle || meta.description,
        generatedAt: report.generatedAt,
        regularFont,
        boldFont
      });
      doc
        .fillColor("#82918c")
        .font(regularFont)
        .fontSize(9)
        .text(`Страница ${pageNumber}`, doc.page.width - 110, doc.page.height - 28, {
          width: 70,
          align: "right"
        });
      pageNumber += 1;
    };

    startPage();

    if (report.kind === "overview") {
      drawRoundedLabel(doc, {
        x: 40,
        y: 164,
        width: 120,
        label: "АКТИВНЫЕ",
        value: String(report.summary.usersByStatus.active ?? 0),
        regularFont,
        boldFont
      });
      drawRoundedLabel(doc, {
        x: 174,
        y: 164,
        width: 120,
        label: "ПРИГЛАШЕНЫ",
        value: String(report.summary.usersByStatus.invited ?? 0),
        tone: "slate",
        regularFont,
        boldFont
      });
      drawRoundedLabel(doc, {
        x: 308,
        y: 164,
        width: 120,
        label: "КУРСЫ",
        value: String(report.summary.coursesByStatus.published ?? 0),
        tone: "green",
        regularFont,
        boldFont
      });
      drawRoundedLabel(doc, {
        x: 442,
        y: 164,
        width: 120,
        label: "ПРОСРОЧКИ",
        value: String(report.summary.overdueAssignments ?? 0),
        tone: "amber",
        regularFont,
        boldFont
      });

      doc.fillColor("#10211b").font(boldFont).fontSize(16).text("Завершение по отделам", 40, 246);
      drawTableHeader(
        doc,
        [
          { key: "name", label: "Отдел", width: 250 },
          { key: "assignmentCount", label: "Назначений", width: 120, align: "center" },
          { key: "averageCompletion", label: "Среднее завершение", width: 152, align: "center" }
        ],
        274,
        boldFont
      );

      let currentY = drawTableRows(doc, {
        columns: [
          { key: "name", label: "Отдел", width: 250, truncate: 40 },
          { key: "assignmentCount", label: "Назначений", width: 120, align: "center" },
          { key: "averageCompletion", label: "Среднее завершение", width: 152, align: "center" }
        ],
        rows: report.summary.completionByDepartment.map((department) => ({
          name: department.name,
          assignmentCount: String(department.assignmentCount),
          averageCompletion: formatPercent(department.averageCompletion)
        })),
        startY: 308,
        bottomY: 720,
        regularFont,
        onPageBreak: () => {
          startPage("Продолжение: завершение по отделам");
          drawTableHeader(
            doc,
            [
              { key: "name", label: "Отдел", width: 250 },
              { key: "assignmentCount", label: "Назначений", width: 120, align: "center" },
              { key: "averageCompletion", label: "Среднее завершение", width: 152, align: "center" }
            ],
            164,
            boldFont
          );
        }
      });

      if (currentY > 612) {
        startPage("Популярные курсы");
        currentY = 164;
      } else {
        currentY += 24;
      }

      doc.fillColor("#10211b").font(boldFont).fontSize(16).text("Популярные курсы", 40, currentY);
      drawTableHeader(
        doc,
        [
          { key: "title", label: "Курс", width: 250 },
          { key: "assignmentCount", label: "Назначений", width: 120, align: "center" },
          { key: "averageCompletion", label: "Среднее завершение", width: 152, align: "center" }
        ],
        currentY + 28,
        boldFont
      );
      drawTableRows(doc, {
        columns: [
          { key: "title", label: "Курс", width: 250, truncate: 42 },
          { key: "assignmentCount", label: "Назначений", width: 120, align: "center" },
          { key: "averageCompletion", label: "Среднее завершение", width: 152, align: "center" }
        ],
        rows: report.summary.topCourses.map((course) => ({
          title: course.title,
          assignmentCount: String(course.assignmentCount),
          averageCompletion: formatPercent(course.averageCompletion)
        })),
        startY: currentY + 62,
        bottomY: 720,
        regularFont,
        onPageBreak: () => {
          startPage("Продолжение: популярные курсы");
          drawTableHeader(
            doc,
            [
              { key: "title", label: "Курс", width: 250 },
              { key: "assignmentCount", label: "Назначений", width: 120, align: "center" },
              { key: "averageCompletion", label: "Среднее завершение", width: 152, align: "center" }
            ],
            164,
            boldFont
          );
        }
      });
    } else if (report.kind === "course_progress") {
      drawRoundedLabel(doc, {
        x: 40,
        y: 164,
        width: 160,
        label: "КУРСОВ В ОТЧЕТЕ",
        value: String(report.items.length),
        regularFont,
        boldFont
      });
      drawRoundedLabel(doc, {
        x: 214,
        y: 164,
        width: 160,
        label: "ОПУБЛИКОВАНО",
        value: String(report.summary.coursesByStatus.published ?? 0),
        tone: "slate",
        regularFont,
        boldFont
      });
      drawRoundedLabel(doc, {
        x: 388,
        y: 164,
        width: 180,
        label: "ПРОСРОЧЕННЫЕ НАЗНАЧЕНИЯ",
        value: String(report.summary.overdueAssignments ?? 0),
        tone: "amber",
        regularFont,
        boldFont
      });

      const columns = [
        { key: "title", label: "Курс", width: 220, truncate: 34 },
        { key: "status", label: "Статус", width: 96, align: "center" },
        { key: "lessonsCount", label: "Уроков", width: 72, align: "center" },
        { key: "assignmentCount", label: "Назначено", width: 92, align: "center" },
        { key: "averageCompletion", label: "Завершение", width: 96, align: "center" },
        { key: "overdueAssignments", label: "Просрочки", width: 88, align: "center" }
      ];

      drawTableHeader(doc, columns, 248, boldFont);
      drawTableRows(doc, {
        columns,
        rows: report.items.map((course) => ({
          title: course.title,
          status: formatCourseStatus(course.status),
          lessonsCount: String(course.lessonsCount),
          assignmentCount: String(course.assignmentCount),
          averageCompletion: formatPercent(course.averageCompletion),
          overdueAssignments: String(course.overdueAssignments)
        })),
        startY: 282,
        bottomY: 540,
        regularFont,
        onPageBreak: () => {
          startPage("Продолжение: прогресс по курсам");
          drawTableHeader(doc, columns, 164, boldFont);
        }
      });
    } else {
      drawRoundedLabel(doc, {
        x: 40,
        y: 164,
        width: 170,
        label: "НАЗНАЧЕНИЙ В ОТЧЕТЕ",
        value: String(report.items.length),
        regularFont,
        boldFont
      });
      drawRoundedLabel(doc, {
        x: 224,
        y: 164,
        width: 170,
        label: "АКТИВНЫЕ СОТРУДНИКИ",
        value: String(report.summary.usersByStatus.active ?? 0),
        tone: "slate",
        regularFont,
        boldFont
      });
      drawRoundedLabel(doc, {
        x: 408,
        y: 164,
        width: 180,
        label: "ПРОСРОЧЕННЫЕ",
        value: String(report.summary.overdueAssignments ?? 0),
        tone: "amber",
        regularFont,
        boldFont
      });

      const columns = [
        { key: "user", label: "Сотрудник", width: 150, truncate: 34 },
        { key: "departmentName", label: "Отдел", width: 110, truncate: 22 },
        { key: "courseTitle", label: "Курс", width: 200, truncate: 36 },
        { key: "progressPercent", label: "Прогресс", width: 78, align: "center" },
        { key: "deadline", label: "Дедлайн", width: 88, align: "center" },
        { key: "assignmentStatus", label: "Состояние", width: 96, align: "center" }
      ];

      drawTableHeader(doc, columns, 248, boldFont);
      drawTableRows(doc, {
        columns,
        rows: report.items.map((item) => ({
          user: `${item.userName} · ${item.userEmail}`,
          departmentName: item.departmentName,
          courseTitle: item.courseTitle,
          progressPercent: formatPercent(item.progressPercent),
          deadline: formatDateOnly(item.deadline),
          assignmentStatus: formatAssignmentStatus(item)
        })),
        startY: 282,
        bottomY: 540,
        regularFont,
        onPageBreak: () => {
          startPage("Продолжение: прогресс сотрудников");
          drawTableHeader(doc, columns, 164, boldFont);
        }
      });
    }

    doc.end();
  });
}

function getReportKindMeta(kind) {
  return REPORT_KINDS[kind] ?? REPORT_KINDS.overview;
}

function getReportFormatMeta(format) {
  return REPORT_FORMATS[format] ?? REPORT_FORMATS.json;
}

async function buildReportPayload(companyId, kind) {
  if (kind === "course_progress") {
    const detailed = await getDetailedReport(companyId);
    return {
      kind,
      generatedAt: new Date().toISOString(),
      summary: detailed.summary,
      items: detailed.courses
    };
  }

  if (kind === "user_progress") {
    const detailed = await getDetailedReport(companyId);
    return {
      kind,
      generatedAt: new Date().toISOString(),
      summary: detailed.summary,
      items: detailed.users
    };
  }

  const summary = await getReportSummary(companyId);
  return {
    kind: "overview",
    generatedAt: new Date().toISOString(),
    summary
  };
}

function getItemCount(report) {
  if (Array.isArray(report.items)) {
    return report.items.length;
  }

  return report.summary?.completionByDepartment?.length ?? 0;
}

function buildFileName(company, kind, format) {
  const kindMeta = getReportKindMeta(kind);
  const formatMeta = getReportFormatMeta(format);
  const dateStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const companyKey = sanitizeFileName(company.domain || `company-${company.id}`);
  return `report-${kindMeta.slug}-${companyKey}-${dateStamp}.${formatMeta.extension}`;
}

export async function queueReportGeneration({
  companyId,
  requestedById = null,
  format = "json",
  kind = "overview"
}) {
  const job = await enqueueBackgroundJob({
    companyId,
    createdById: requestedById,
    type: REPORT_GENERATION_JOB_TYPE,
    payload: {
      format,
      kind
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: requestedById,
    action: "report.queued",
    entityType: "background_job",
    entityId: job.id,
    metadata: {
      format,
      kind
    }
  });

  return job;
}

export async function listGeneratedReports(companyId, filters = {}) {
  return listBackgroundJobs(companyId, {
    ...filters,
    type: REPORT_GENERATION_JOB_TYPE
  });
}

export async function processReportGenerationJob(payload, job) {
  const company = await prisma.company.findUnique({
    where: {
      id: job.companyId ?? 0
    }
  });

  if (!company) {
    throw new Error("Компания для генерации отчета не найдена");
  }

  const kind = payload.kind ?? "overview";
  const format = payload.format ?? "json";
  const reportPayload = await buildReportPayload(company.id, kind);
  const report = {
    company: {
      id: company.id,
      name: company.name,
      domain: company.domain
    },
    ...reportPayload
  };

  const fileName = buildFileName(company, kind, format);
  const filePath = path.join(config.uploadDir, "reports", fileName);
  const fileUrl = `/uploads/reports/${fileName}`;
  const formatMeta = getReportFormatMeta(format);
  const kindMeta = getReportKindMeta(kind);

  if (format === "csv") {
    await writeTextFile(filePath, toCsv(kind, report));
  } else if (format === "pdf") {
    await writePdfReport(filePath, report);
  } else {
    await writeJsonFile(filePath, report);
  }

  const result = {
    fileUrl,
    fileName,
    contentType: formatMeta.contentType,
    format: formatMeta.extension,
    formatLabel: formatMeta.label,
    kind,
    kindLabel: kindMeta.title,
    generatedAt: report.generatedAt,
    itemCount: getItemCount(report)
  };

  await recordAuditEvent({
    companyId: company.id,
    actorId: job.createdById ?? null,
    action: "report.generated",
    entityType: "background_job",
    entityId: job.id,
    metadata: {
      fileUrl,
      format: formatMeta.extension,
      kind
    }
  });

  return result;
}

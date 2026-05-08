import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import PDFDocument from "pdfkit";
import prisma from "../database/prisma.js";
import config from "../config/index.js";
import { badRequest, notFound } from "../utils/errors.js";
import { enqueueBackgroundJob } from "./backgroundJobService.js";
import { recordAuditEvent } from "./auditService.js";
import {
  ensureDirectory,
  sanitizeFileName,
  writeTextFile
} from "../utils/storage.js";

export const CERTIFICATE_JOB_TYPE = "certificate_generation";

const countLessons = (modules = []) =>
  modules.reduce((total, module) => total + module.lessons.length, 0);

const htmlEscapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);

const buildVerificationUrl = (verificationCode) =>
  `${config.clientUrl}/verify-certificate/${encodeURIComponent(verificationCode)}`;

const getUploadFilePath = (uploadUrl) => {
  if (!uploadUrl?.startsWith("/uploads/")) {
    return null;
  }

  const relativePath = uploadUrl.replace(/^\/uploads\//, "");
  return path.join(config.uploadDir, relativePath);
};

export const getCertificatePdfUrl = (certificateUrl) =>
  certificateUrl?.replace(/\.html$/i, ".pdf") ?? null;

const getCertificatePdfPath = (certificateUrl) => {
  const pdfUrl = getCertificatePdfUrl(certificateUrl);
  return pdfUrl ? getUploadFilePath(pdfUrl) : null;
};

const formatCertificateDate = (value) =>
  new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(value));

const buildDigestPreview = (digest) =>
  digest ? `${digest.slice(0, 12)}...${digest.slice(-12)}` : "";

const resolveExistingUploadFilePath = (assetUrl) => {
  const filePath = getUploadFilePath(assetUrl);
  return filePath && fs.existsSync(filePath) ? filePath : null;
};

const isPdfEmbedImageSupported = (filePath) => /\.(png|jpe?g)$/i.test(filePath ?? "");

export const serializeCertificate = (certificate) =>
  certificate
    ? {
        id: certificate.id,
        issuedAt: certificate.issuedAt,
        certificateUrl: certificate.certificateUrl,
        pdfUrl: getCertificatePdfUrl(certificate.certificateUrl),
        verificationCode: certificate.verificationCode,
        signedByName: certificate.signedByName,
        signedByTitle: certificate.signedByTitle
      }
    : null;

const serializeCertificateListItem = (certificate) => {
  const pdfPath = getCertificatePdfPath(certificate.certificateUrl);

  return {
    ...serializeCertificate(certificate),
    course: certificate.course
      ? {
          id: certificate.course.id,
          title: certificate.course.title,
          status: certificate.course.status
        }
      : null,
    company: certificate.course?.company
      ? {
          id: certificate.course.company.id,
          name: certificate.course.company.name
        }
      : null,
    isPdfReady: Boolean(pdfPath && fs.existsSync(pdfPath))
  };
};

const buildSignatureDigest = ({
  verificationCode,
  companyId,
  courseId,
  userId,
  issuedAt,
  verificationKey
}) =>
  crypto
    .createHash("sha256")
    .update(
      `${verificationCode}:${companyId}:${courseId}:${userId}:${issuedAt.toISOString()}:${verificationKey}`
    )
    .digest("hex");

async function ensureCompanyVerificationKey(company) {
  if (company.certificateVerificationKey) {
    return company.certificateVerificationKey;
  }

  const updatedCompany = await prisma.company.update({
    where: {
      id: company.id
    },
    data: {
      certificateVerificationKey: crypto.randomUUID().replace(/-/g, "")
    }
  });

  return updatedCompany.certificateVerificationKey;
}

async function generateUniqueVerificationCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const verificationCode = crypto.randomBytes(6).toString("hex").toUpperCase();
    const existingCertificate = await prisma.certificate.findUnique({
      where: {
        verificationCode
      }
    });

    if (!existingCertificate) {
      return verificationCode;
    }
  }

  return crypto.randomUUID().replace(/-/g, "").toUpperCase();
}

function buildCertificateHtml({
  company,
  course,
  user,
  issuedAt,
  verificationCode,
  signatureDigest
}) {
  const verificationUrl = buildVerificationUrl(verificationCode);
  const directorName = company.directorName || "Директор компании";
  const directorTitle = company.directorTitle || "Генеральный директор";
  const signatureMarkup = company.directorSignatureUrl
    ? `<img class="signature-image" src="${escapeHtml(company.directorSignatureUrl)}" alt="Подпись директора" />`
    : `<div class="signature-script">${escapeHtml(directorName)}</div>`;

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Сертификат о прохождении курса</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 36px;
        font-family: "Segoe UI", Tahoma, sans-serif;
        color: #0f172a;
        background:
          radial-gradient(circle at top left, rgba(29, 78, 216, 0.16), transparent 28%),
          radial-gradient(circle at bottom right, rgba(217, 119, 6, 0.16), transparent 34%),
          linear-gradient(180deg, #f8fafc 0%, #fff7ed 100%);
      }
      .frame {
        position: relative;
        max-width: 1100px;
        margin: 0 auto;
        border-radius: 32px;
        overflow: hidden;
        background:
          linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96)),
          #0f172a;
        box-shadow: 0 30px 80px rgba(15, 23, 42, 0.24);
      }
      .frame::before {
        content: "";
        position: absolute;
        inset: 18px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 24px;
        pointer-events: none;
      }
      .body {
        position: relative;
        padding: 54px;
        background:
          radial-gradient(circle at top right, rgba(96, 165, 250, 0.18), transparent 28%),
          radial-gradient(circle at bottom left, rgba(251, 191, 36, 0.18), transparent 30%);
      }
      .capsule {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 12px 18px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.84);
        letter-spacing: 0.22em;
        text-transform: uppercase;
        font-size: 11px;
        font-weight: 700;
      }
      .hero {
        display: grid;
        gap: 32px;
        grid-template-columns: 1.4fr 0.6fr;
        margin-top: 28px;
      }
      .headline {
        color: white;
      }
      .headline h1 {
        margin: 0;
        font-size: clamp(34px, 5vw, 56px);
        line-height: 1.05;
      }
      .headline p {
        margin: 20px 0 0;
        max-width: 720px;
        font-size: 18px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.78);
      }
      .glass {
        border-radius: 28px;
        padding: 24px;
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(18px);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .seal {
        display: grid;
        place-items: center;
        min-height: 210px;
        text-align: center;
        color: white;
      }
      .seal-ring {
        width: 170px;
        height: 170px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.28);
        display: grid;
        place-items: center;
        box-shadow: inset 0 0 0 10px rgba(255, 255, 255, 0.05);
      }
      .seal-ring strong {
        display: block;
        font-size: 15px;
        line-height: 1.5;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .content {
        display: grid;
        gap: 28px;
        grid-template-columns: 1.1fr 0.9fr;
        margin-top: 32px;
      }
      .paper {
        border-radius: 28px;
        padding: 34px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
      }
      .paper-label {
        font-size: 13px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: #64748b;
      }
      .student-name {
        margin: 18px 0 0;
        font-size: clamp(30px, 4vw, 44px);
        color: #0f172a;
      }
      .course-name {
        margin: 20px 0 0;
        font-size: clamp(24px, 3.6vw, 34px);
        color: #1d4ed8;
      }
      .meta-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 28px;
      }
      .meta-item {
        border-radius: 20px;
        padding: 18px;
        background: #eff6ff;
      }
      .meta-item span {
        display: block;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #64748b;
      }
      .meta-item strong {
        display: block;
        margin-top: 10px;
        font-size: 18px;
        color: #0f172a;
      }
      .security-card {
        color: rgba(255, 255, 255, 0.92);
      }
      .signature-card {
        margin-top: 20px;
        padding-top: 18px;
        border-top: 1px solid rgba(255, 255, 255, 0.14);
      }
      .signature-image {
        max-width: 220px;
        max-height: 90px;
        object-fit: contain;
        filter: drop-shadow(0 14px 22px rgba(15, 23, 42, 0.28));
      }
      .signature-script {
        font-family: "Segoe Script", "Brush Script MT", cursive;
        font-size: 42px;
        line-height: 1.1;
        color: #f8fafc;
      }
      .director-line {
        margin-top: 8px;
        font-size: 15px;
        color: rgba(255, 255, 255, 0.76);
      }
      .verify {
        margin-top: 22px;
        padding: 16px 18px;
        border-radius: 20px;
        background: rgba(15, 23, 42, 0.24);
      }
      .verify-code {
        margin-top: 8px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 0.16em;
        color: #fbbf24;
      }
      .verify a {
        color: white;
        word-break: break-word;
      }
      .digest {
        margin-top: 12px;
        font-size: 11px;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.58);
        word-break: break-all;
      }
      @media (max-width: 900px) {
        body {
          padding: 16px;
        }
        .body {
          padding: 28px;
        }
        .hero,
        .content,
        .meta-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="frame">
      <div class="body">
        <div class="capsule">SaaS LMS Certificate</div>
        <section class="hero">
          <div class="headline">
            <h1>Сертификат о завершении обучения</h1>
            <p>
              Настоящим подтверждается, что сотрудник успешно завершил программу обучения
              внутри корпоративной академии <strong>${escapeHtml(company.name)}</strong>.
            </p>
          </div>
          <aside class="glass seal">
            <div class="seal-ring">
              <strong>
                ${escapeHtml(company.name)}<br />
                verified<br />
                certificate
              </strong>
            </div>
          </aside>
        </section>

        <section class="content">
          <article class="paper">
            <div class="paper-label">Выдан сотруднику</div>
            <h2 class="student-name">${escapeHtml(user.name)}</h2>
            <div class="paper-label" style="margin-top: 18px;">За прохождение курса</div>
            <div class="course-name">${escapeHtml(course.title)}</div>
            <div class="meta-grid">
              <div class="meta-item">
                <span>Компания</span>
                <strong>${escapeHtml(company.name)}</strong>
              </div>
              <div class="meta-item">
                <span>Дата выдачи</span>
                <strong>${escapeHtml(
                  new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(issuedAt)
                )}</strong>
              </div>
            </div>
          </article>

          <aside class="glass security-card">
            <div class="paper-label" style="color: rgba(255,255,255,0.62);">Подписано директором</div>
            <div class="signature-card">
              ${signatureMarkup}
              <div class="director-line"><strong>${escapeHtml(directorName)}</strong></div>
              <div class="director-line">${escapeHtml(directorTitle)}</div>
            </div>

            <div class="verify">
              <div class="paper-label" style="color: rgba(255,255,255,0.62);">Проверка подлинности</div>
              <div class="verify-code">${escapeHtml(verificationCode)}</div>
              <div style="margin-top: 10px; font-size: 14px; line-height: 1.6;">
                Проверить сертификат можно по ссылке:<br />
                <a href="${escapeHtml(verificationUrl)}">${escapeHtml(verificationUrl)}</a>
              </div>
              <div class="digest">SHA-256: ${escapeHtml(signatureDigest)}</div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  </body>
</html>`;
}

function buildPremiumCertificateHtml({
  company,
  course,
  user,
  issuedAt,
  verificationCode,
  signatureDigest
}) {
  const verificationUrl = buildVerificationUrl(verificationCode);
  const directorName = company.directorName || "Директор компании";
  const directorTitle = company.directorTitle || "Генеральный директор";
  const issuedDate = formatCertificateDate(issuedAt);
  const digestPreview = buildDigestPreview(signatureDigest);
  const companyLogoMarkup = company.logo
    ? `<img class="company-logo" src="${escapeHtml(company.logo)}" alt="Логотип компании ${escapeHtml(
        company.name
      )}" />`
    : `<div class="company-logo company-logo-fallback">${escapeHtml(
        company.name.slice(0, 1).toUpperCase()
      )}</div>`;
  const signatureMarkup = company.directorSignatureUrl
    ? `<img class="signature-image" src="${escapeHtml(company.directorSignatureUrl)}" alt="Подпись директора" />`
    : `<div class="signature-script">${escapeHtml(directorName)}</div>`;

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Сертификат о завершении курса</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 28px;
        font-family: "Segoe UI", Tahoma, sans-serif;
        color: #10211b;
        background:
          radial-gradient(circle at top left, rgba(15, 122, 101, 0.16), transparent 24%),
          radial-gradient(circle at right center, rgba(217, 137, 48, 0.18), transparent 32%),
          linear-gradient(180deg, #f6f0e6 0%, #edf4ef 100%);
      }
      .page {
        max-width: 1180px;
        margin: 0 auto;
      }
      .certificate {
        position: relative;
        overflow: hidden;
        border-radius: 36px;
        border: 1px solid #d8ccb5;
        background: linear-gradient(180deg, rgba(255, 253, 247, 0.98), rgba(248, 242, 228, 0.98));
        box-shadow: 0 28px 80px rgba(16, 33, 27, 0.14);
      }
      .certificate::before {
        content: "";
        position: absolute;
        inset: 18px;
        border-radius: 26px;
        border: 1px solid rgba(16, 33, 27, 0.12);
        pointer-events: none;
      }
      .body {
        position: relative;
        padding: 42px;
      }
      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 18px;
      }
      .company-logo {
        width: 88px;
        height: 88px;
        border-radius: 24px;
        object-fit: cover;
        border: 1px solid rgba(16, 33, 27, 0.12);
        background: white;
        box-shadow: 0 12px 28px rgba(16, 33, 27, 0.08);
      }
      .company-logo-fallback {
        display: grid;
        place-items: center;
        font-size: 34px;
        font-weight: 800;
        color: white;
        background: linear-gradient(135deg, #0f7a65 0%, #d98930 100%);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(15, 122, 101, 0.08);
        color: #0f7a65;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        font-size: 11px;
        font-weight: 700;
      }
      .company-name {
        margin: 14px 0 0;
        font-size: 30px;
        line-height: 1.1;
        color: #10211b;
      }
      .registry-chip {
        min-width: 250px;
        padding: 18px 20px;
        border-radius: 26px;
        background: #10211b;
        color: white;
      }
      .registry-chip span,
      .hero-card span,
      .meta-item span,
      .section-title,
      .verify-card span,
      .seal span {
        display: block;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }
      .registry-chip span {
        color: rgba(255, 255, 255, 0.64);
      }
      .registry-chip strong {
        display: block;
        margin-top: 12px;
        font-size: 28px;
        letter-spacing: 0.16em;
        color: #f4c074;
      }
      .registry-chip small {
        display: block;
        margin-top: 12px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.78);
      }
      .hero {
        margin-top: 30px;
        padding: 34px;
        border-radius: 30px;
        background: linear-gradient(135deg, #10211b 0%, #0f7a65 56%, #d98930 100%);
        color: white;
      }
      .hero h1 {
        margin: 18px 0 0;
        max-width: 860px;
        font-size: clamp(34px, 5vw, 56px);
        line-height: 1.02;
      }
      .hero p {
        margin: 18px 0 0;
        max-width: 780px;
        font-size: 18px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.84);
      }
      .hero-grid,
      .meta-grid,
      .content,
      .callout-grid {
        display: grid;
        gap: 18px;
      }
      .hero-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 26px;
      }
      .hero-card {
        min-height: 136px;
        padding: 22px 24px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.16);
        backdrop-filter: blur(12px);
      }
      .hero-card span {
        color: rgba(255, 255, 255, 0.66);
      }
      .hero-card strong {
        display: block;
        margin-top: 14px;
        font-size: clamp(24px, 3vw, 38px);
        line-height: 1.1;
        color: white;
      }
      .meta-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-top: 22px;
      }
      .meta-item {
        padding: 20px 22px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(16, 33, 27, 0.08);
      }
      .meta-item span,
      .section-title {
        color: #6d7b76;
      }
      .meta-item strong {
        display: block;
        margin-top: 12px;
        font-size: 18px;
        line-height: 1.4;
        color: #10211b;
      }
      .meta-item a {
        display: inline-flex;
        margin-top: 12px;
        font-weight: 700;
        color: #0f7a65;
        text-decoration: none;
      }
      .content {
        grid-template-columns: 1.15fr 0.85fr;
        margin-top: 22px;
      }
      .paper,
      .side-column {
        display: grid;
        gap: 18px;
      }
      .paper-card,
      .sign-card,
      .verify-card,
      .seal-card {
        border-radius: 28px;
        padding: 28px;
        border: 1px solid rgba(16, 33, 27, 0.08);
      }
      .paper-card {
        background: white;
      }
      .statement {
        margin: 18px 0 0;
        font-size: 19px;
        line-height: 1.8;
        color: #33413c;
      }
      .callout-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 24px;
      }
      .callout {
        padding: 16px 18px;
        border-radius: 20px;
        background: #eef4ef;
        color: #33413c;
        font-size: 15px;
        line-height: 1.6;
      }
      .sign-card {
        background: linear-gradient(180deg, #10211b 0%, #173229 100%);
        color: rgba(255, 255, 255, 0.9);
      }
      .sign-card .section-title,
      .verify-card span {
        color: rgba(255, 255, 255, 0.62);
      }
      .signature-image {
        max-width: 240px;
        max-height: 88px;
        object-fit: contain;
        filter: drop-shadow(0 14px 20px rgba(0, 0, 0, 0.26));
      }
      .signature-script {
        font-family: "Segoe Script", "Brush Script MT", cursive;
        font-size: 44px;
        line-height: 1.1;
        color: #fffdf8;
      }
      .sign-name {
        margin-top: 16px;
        font-size: 20px;
        font-weight: 700;
        color: white;
      }
      .sign-title {
        margin-top: 8px;
        font-size: 14px;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.74);
      }
      .verify-card {
        background: linear-gradient(135deg, #16362d 0%, #0f7a65 100%);
        color: white;
      }
      .verify-code {
        margin-top: 12px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 0.18em;
        color: #ffd18d;
      }
      .verify-card a {
        display: inline-flex;
        margin-top: 12px;
        color: white;
        word-break: break-word;
        text-decoration: none;
        font-weight: 700;
      }
      .verify-note {
        margin-top: 14px;
        font-size: 14px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.82);
      }
      .digest {
        margin-top: 16px;
        font-size: 11px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.68);
        word-break: break-word;
      }
      .seal-card {
        display: grid;
        place-items: center;
        min-height: 240px;
        background: radial-gradient(circle at 50% 35%, rgba(244, 192, 116, 0.34), transparent 44%), white;
      }
      .seal {
        display: grid;
        place-items: center;
        width: 214px;
        height: 214px;
        padding: 24px;
        border-radius: 50%;
        border: 2px solid rgba(217, 137, 48, 0.48);
        box-shadow:
          inset 0 0 0 10px rgba(217, 137, 48, 0.08),
          inset 0 0 0 24px rgba(15, 122, 101, 0.06);
        text-align: center;
      }
      .seal span {
        color: #6d7b76;
      }
      .seal strong {
        display: block;
        margin: 10px 0;
        font-size: 22px;
        line-height: 1.25;
        color: #10211b;
      }
      @media (max-width: 900px) {
        body {
          padding: 16px;
        }
        .body {
          padding: 24px;
        }
        .content,
        .meta-grid,
        .hero-grid,
        .callout-grid {
          grid-template-columns: 1fr;
        }
        .header {
          flex-direction: column;
        }
        .registry-chip {
          min-width: 0;
          width: 100%;
        }
      }
      @media (max-width: 640px) {
        .brand {
          align-items: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="certificate">
        <div class="body">
          <header class="header">
            <div class="brand">
              ${companyLogoMarkup}
              <div>
                <div class="eyebrow">Корпоративная академия</div>
                <h1 class="company-name">${escapeHtml(company.name)}</h1>
              </div>
            </div>

            <aside class="registry-chip">
              <span>Реестровая запись</span>
              <strong>${escapeHtml(verificationCode)}</strong>
              <small>Дата выдачи: ${escapeHtml(issuedDate)}</small>
            </aside>
          </header>

          <section class="hero">
            <div class="eyebrow" style="background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.86);">
              Официальный документ о завершении обучения
            </div>
            <h1>Сертификат о завершении курса</h1>
            <p>
              Настоящим подтверждается, что сотрудник успешно прошёл обучение в
              корпоративной академии <strong>${escapeHtml(company.name)}</strong> и
              выполнил требования программы в полном объёме.
            </p>

            <div class="hero-grid">
              <div class="hero-card">
                <span>Сотрудник</span>
                <strong>${escapeHtml(user.name)}</strong>
              </div>
              <div class="hero-card">
                <span>Программа обучения</span>
                <strong>${escapeHtml(course.title)}</strong>
              </div>
            </div>
          </section>

          <section class="meta-grid">
            <div class="meta-item">
              <span>Компания</span>
              <strong>${escapeHtml(company.name)}</strong>
            </div>
            <div class="meta-item">
              <span>Дата выдачи</span>
              <strong>${escapeHtml(issuedDate)}</strong>
            </div>
            <div class="meta-item">
              <span>Проверка подлинности</span>
              <strong>Открытый реестр сертификатов</strong>
              <a href="${escapeHtml(verificationUrl)}">${escapeHtml(verificationUrl)}</a>
            </div>
          </section>

          <section class="content">
            <div class="paper">
              <article class="paper-card">
                <span class="section-title">Основание выдачи</span>
                <p class="statement">
                  Документ подтверждает, что сотрудник завершил обучение, прошёл
                  предусмотренные материалы и может использовать полученные знания
                  в рабочем контуре компании.
                </p>

                <div class="callout-grid">
                  <div class="callout">Курс завершён полностью и отмечен в системе обучения.</div>
                  <div class="callout">Результат зафиксирован в журнале компании и доступен в отчётах.</div>
                  <div class="callout">Сертификат подписан уполномоченным руководителем компании.</div>
                  <div class="callout">Проверочный код и цифровой отпечаток защищают документ от подмены.</div>
                </div>
              </article>
            </div>

            <div class="side-column">
              <article class="sign-card">
                <span class="section-title">Подписано директором компании</span>
                <div style="margin-top: 22px;">${signatureMarkup}</div>
                <div class="sign-name">${escapeHtml(directorName)}</div>
                <div class="sign-title">${escapeHtml(directorTitle)}</div>
              </article>

              <article class="verify-card">
                <span>Проверка подлинности</span>
                <div class="verify-code">${escapeHtml(verificationCode)}</div>
                <div class="verify-note">
                  Проверить сертификат можно в публичном реестре по коду или по
                  прямой ссылке ниже.
                </div>
                <a href="${escapeHtml(verificationUrl)}">${escapeHtml(verificationUrl)}</a>
                <div class="digest">SHA-256: ${escapeHtml(digestPreview)} · полный отпечаток хранится в системе</div>
              </article>

              <article class="seal-card">
                <div class="seal">
                  <span>${escapeHtml(company.name)}</span>
                  <strong>Подтверждённый сертификат</strong>
                  <span>официальная запись</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

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
    ]),
    italic: resolveExistingFont([
      path.join(fontsDir, "ariali.ttf"),
      path.join(fontsDir, "segoeuii.ttf"),
      path.join(fontsDir, "calibrii.ttf")
    ])
  };
};

const isPdfSignatureImageSupported = (filePath) => /\.(png|jpe?g)$/i.test(filePath ?? "");

async function writePdfCertificate(
  filePath,
  { company, course, user, issuedAt, verificationCode, signatureDigest }
) {
  await ensureDirectory(path.dirname(filePath));

  return new Promise((resolve, reject) => {
    const fonts = getPdfFonts();
    const regularFont = fonts.regular ? "LmsRegular" : "Helvetica";
    const boldFont = fonts.bold ? "LmsBold" : "Helvetica-Bold";
    const italicFont = fonts.italic ? "LmsItalic" : regularFont;
    const verificationUrl = buildVerificationUrl(verificationCode);
    const directorName = company.directorName || "Директор компании";
    const directorTitle = company.directorTitle || "Генеральный директор";
    const stream = fs.createWriteStream(filePath);
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: {
        Title: `Сертификат: ${course.title}`,
        Author: company.name,
        Subject: "Сертификат о прохождении курса"
      }
    });

    doc.on("error", reject);
    stream.on("error", reject);
    stream.on("finish", () => resolve(filePath));

    doc.pipe(stream);

    if (fonts.regular) {
      doc.registerFont("LmsRegular", fonts.regular);
    }

    if (fonts.bold) {
      doc.registerFont("LmsBold", fonts.bold);
    }

    if (fonts.italic) {
      doc.registerFont("LmsItalic", fonts.italic);
    }

    doc.rect(0, 0, 842, 595).fill("#0f172a");
    doc.rect(0, 0, 842, 210).fill("#1d4ed8");
    doc.circle(760, 90, 180).fillOpacity(0.12).fill("#fbbf24").fillOpacity(1);
    doc.circle(70, 535, 150).fillOpacity(0.08).fill("#f8fafc").fillOpacity(1);

    doc.roundedRect(28, 28, 786, 539, 28).lineWidth(2).strokeColor("#ffffff").opacity(0.18).stroke().opacity(1);
    doc.roundedRect(52, 70, 738, 455, 24).fill("#ffffff");

    doc.font(boldFont).fontSize(12).fillColor("#64748b").text("КОРПОРАТИВНАЯ АКАДЕМИЯ", 90, 110, {
      characterSpacing: 2
    });
    doc.font(boldFont).fontSize(34).fillColor("#0f172a").text("Сертификат о завершении обучения", 90, 142, {
      width: 430,
      lineGap: 4
    });
    doc.font(regularFont).fontSize(15).fillColor("#475569").text(
      "Настоящим подтверждается, что сотрудник успешно завершил программу обучения внутри корпоративной академии компании.",
      90,
      228,
      {
        width: 420,
        lineGap: 6
      }
    );

    doc.font(boldFont).fontSize(30).fillColor("#111827").text(user.name, 90, 312, {
      width: 420
    });
    doc.font(regularFont).fontSize(12).fillColor("#64748b").text("ЗА ПРОХОЖДЕНИЕ КУРСА", 90, 360, {
      characterSpacing: 2
    });
    doc.font(boldFont).fontSize(24).fillColor("#1d4ed8").text(course.title, 90, 384, {
      width: 430
    });

    doc.roundedRect(90, 452, 180, 54, 18).fill("#eff6ff");
    doc.roundedRect(286, 452, 180, 54, 18).fill("#eff6ff");
    doc.font(regularFont).fontSize(10).fillColor("#64748b").text("Компания", 110, 466, {
      characterSpacing: 1.5
    });
    doc.font(boldFont).fontSize(15).fillColor("#0f172a").text(company.name, 110, 483, {
      width: 140
    });
    doc.font(regularFont).fontSize(10).fillColor("#64748b").text("Дата выдачи", 306, 466, {
      characterSpacing: 1.5
    });
    doc.font(boldFont).fontSize(15).fillColor("#0f172a").text(
      new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(issuedAt),
      306,
      483,
      {
        width: 140
      }
    );

    doc.roundedRect(552, 116, 182, 182, 91).fill("#0f172a");
    doc.circle(643, 207, 72).lineWidth(2).strokeColor("#f8fafc").opacity(0.35).stroke().opacity(1);
    doc.font(boldFont).fontSize(14).fillColor("#f8fafc").text(company.name, 575, 176, {
      width: 136,
      align: "center"
    });
    doc.font(regularFont).fontSize(11).fillColor("#cbd5e1").text("verified certificate", 580, 222, {
      width: 126,
      align: "center"
    });

    doc.font(boldFont).fontSize(12).fillColor("#64748b").text("ПОДПИСАНО ДИРЕКТОРОМ", 552, 340, {
      characterSpacing: 1.6
    });
    doc.moveTo(552, 426).lineTo(742, 426).lineWidth(1).strokeColor("#cbd5e1").stroke();

    const signatureFilePath = getUploadFilePath(company.directorSignatureUrl);
    if (
      signatureFilePath &&
      isPdfSignatureImageSupported(signatureFilePath) &&
      fs.existsSync(signatureFilePath)
    ) {
      doc.image(signatureFilePath, 552, 370, {
        fit: [180, 46],
        align: "left",
        valign: "center"
      });
    } else {
      doc.font(italicFont).fontSize(28).fillColor("#0f172a").text(directorName, 552, 378, {
        width: 190
      });
    }

    doc.font(boldFont).fontSize(14).fillColor("#0f172a").text(directorName, 552, 438, {
      width: 210
    });
    doc.font(regularFont).fontSize(12).fillColor("#64748b").text(directorTitle, 552, 458, {
      width: 210
    });

    doc.roundedRect(536, 490, 226, 55, 18).fill("#f8fafc");
    doc.font(regularFont).fontSize(10).fillColor("#64748b").text("КОД ПРОВЕРКИ", 552, 504, {
      characterSpacing: 1.8
    });
    doc.font(boldFont).fontSize(16).fillColor("#b45309").text(verificationCode, 552, 520, {
      characterSpacing: 1.4
    });

    doc.font(regularFont).fontSize(8).fillColor("#94a3b8").text(`Проверка: ${verificationUrl}`, 90, 528, {
      width: 400
    });
    doc.font(regularFont).fontSize(7).fillColor("#94a3b8").text(`SHA-256: ${signatureDigest}`, 90, 543, {
      width: 640
    });

    doc.end();
  });
}

async function writePremiumPdfCertificate(
  filePath,
  { company, course, user, issuedAt, verificationCode, signatureDigest }
) {
  await ensureDirectory(path.dirname(filePath));

  return new Promise((resolve, reject) => {
    const fonts = getPdfFonts();
    const regularFont = fonts.regular ? "LmsRegular" : "Helvetica";
    const boldFont = fonts.bold ? "LmsBold" : "Helvetica-Bold";
    const italicFont = fonts.italic ? "LmsItalic" : regularFont;
    const verificationUrl = buildVerificationUrl(verificationCode);
    const directorName = company.directorName || "Директор компании";
    const directorTitle = company.directorTitle || "Генеральный директор";
    const issuedDate = formatCertificateDate(issuedAt);
    const digestPreview = buildDigestPreview(signatureDigest);
    const companyLogoPath = resolveExistingUploadFilePath(company.logo);
    const signatureFilePath = resolveExistingUploadFilePath(company.directorSignatureUrl);
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: {
        Title: `Сертификат: ${course.title}`,
        Author: company.name,
        Subject: "Сертификат о завершении курса"
      }
    });
    const stream = fs.createWriteStream(filePath);

    doc.on("error", reject);
    stream.on("error", reject);
    stream.on("finish", () => resolve(filePath));

    doc.pipe(stream);

    if (fonts.regular) {
      doc.registerFont("LmsRegular", fonts.regular);
    }

    if (fonts.bold) {
      doc.registerFont("LmsBold", fonts.bold);
    }

    if (fonts.italic) {
      doc.registerFont("LmsItalic", fonts.italic);
    }

    doc.rect(0, 0, 842, 595).fill("#f5efe4");
    doc.circle(100, 88, 120).fillOpacity(0.12).fill("#0f7a65").fillOpacity(1);
    doc.circle(760, 120, 140).fillOpacity(0.12).fill("#d98930").fillOpacity(1);
    doc.circle(760, 540, 120).fillOpacity(0.08).fill("#10211b").fillOpacity(1);

    doc.roundedRect(30, 30, 782, 535, 30).fill("#fffdf7");
    doc.roundedRect(30, 30, 782, 535, 30).lineWidth(1).strokeColor("#d8ccb5").stroke();
    doc.roundedRect(48, 48, 746, 499, 24).lineWidth(1).strokeColor("#e6dcc8").stroke();

    if (companyLogoPath && isPdfEmbedImageSupported(companyLogoPath)) {
      doc.roundedRect(74, 74, 78, 78, 20).fill("#ffffff");
      doc.image(companyLogoPath, 74, 74, {
        fit: [78, 78],
        align: "center",
        valign: "center"
      });
    } else {
      doc.roundedRect(74, 74, 78, 78, 20).fill("#0f7a65");
      doc.font(boldFont).fontSize(34).fillColor("#ffffff").text(
        (company.name || "C").slice(0, 1).toUpperCase(),
        74,
        96,
        { width: 78, align: "center" }
      );
    }

    doc.font(boldFont).fontSize(11).fillColor("#0f7a65").text("КОРПОРАТИВНАЯ АКАДЕМИЯ", 170, 84, {
      characterSpacing: 2.2
    });
    doc.font(boldFont).fontSize(28).fillColor("#10211b").text(company.name, 170, 108, {
      width: 330,
      lineGap: 2
    });

    doc.roundedRect(600, 70, 168, 88, 22).fill("#10211b");
    doc.font(regularFont).fontSize(10).fillColor("#c3d0cb").text("РЕЕСТРОВАЯ ЗАПИСЬ", 620, 90, {
      characterSpacing: 1.8
    });
    doc.font(boldFont).fontSize(22).fillColor("#f4c074").text(verificationCode, 620, 110, {
      width: 128
    });
    doc.font(regularFont).fontSize(11).fillColor("#ffffff").text(`Выдан ${issuedDate}`, 620, 136, {
      width: 124
    });

    doc.roundedRect(72, 180, 698, 168, 28).fill("#10211b");
    doc.rect(72, 260, 698, 88).fill("#0f7a65");
    doc.rect(560, 180, 210, 168).fillOpacity(0.22).fill("#d98930").fillOpacity(1);
    doc.font(boldFont).fontSize(11).fillColor("#d8ede6").text("ОФИЦИАЛЬНЫЙ ДОКУМЕНТ О ЗАВЕРШЕНИИ ОБУЧЕНИЯ", 102, 212, {
      characterSpacing: 1.6
    });
    doc.font(boldFont).fontSize(34).fillColor("#ffffff").text("Сертификат о завершении курса", 102, 238, {
      width: 420,
      lineGap: 2
    });
    doc.font(regularFont).fontSize(14).fillColor("#e6f3ee").text(
      `Настоящим подтверждается, что сотрудник успешно прошёл обучение в корпоративной академии ${company.name} и выполнил требования программы в полном объёме.`,
      102,
      300,
      {
        width: 470,
        lineGap: 4
      }
    );

    doc.roundedRect(90, 366, 220, 92, 22).fill("#ffffff");
    doc.roundedRect(326, 366, 348, 92, 22).fill("#ffffff");
    doc.font(regularFont).fontSize(10).fillColor("#6d7b76").text("СОТРУДНИК", 110, 384, {
      characterSpacing: 1.8
    });
    doc.font(boldFont).fontSize(24).fillColor("#10211b").text(user.name, 110, 405, {
      width: 180
    });
    doc.font(regularFont).fontSize(10).fillColor("#6d7b76").text("ПРОГРАММА ОБУЧЕНИЯ", 346, 384, {
      characterSpacing: 1.8
    });
    doc.font(boldFont).fontSize(22).fillColor("#10211b").text(course.title, 346, 405, {
      width: 308
    });

    doc.roundedRect(72, 482, 210, 54, 20).fill("#eef4ef");
    doc.roundedRect(298, 482, 210, 54, 20).fill("#eef4ef");
    doc.roundedRect(524, 482, 246, 54, 20).fill("#eef4ef");
    doc.font(regularFont).fontSize(10).fillColor("#6d7b76").text("КОМПАНИЯ", 92, 498, {
      characterSpacing: 1.6
    });
    doc.font(boldFont).fontSize(14).fillColor("#10211b").text(company.name, 92, 514, {
      width: 170
    });
    doc.font(regularFont).fontSize(10).fillColor("#6d7b76").text("ДАТА ВЫДАЧИ", 318, 498, {
      characterSpacing: 1.6
    });
    doc.font(boldFont).fontSize(14).fillColor("#10211b").text(issuedDate, 318, 514, {
      width: 170
    });
    doc.font(regularFont).fontSize(10).fillColor("#6d7b76").text("ПРОВЕРКА ПОДЛИННОСТИ", 544, 498, {
      characterSpacing: 1.4
    });
    doc.font(boldFont).fontSize(13).fillColor("#0f7a65").text("Открытый реестр сертификатов", 544, 514, {
      width: 206
    });

    doc.roundedRect(522, 182, 248, 128, 24).fill("#ffffff");
    doc.font(boldFont).fontSize(11).fillColor("#6d7b76").text("ПОДПИСАНО ДИРЕКТОРОМ КОМПАНИИ", 546, 206, {
      characterSpacing: 1.4
    });

    if (signatureFilePath && isPdfEmbedImageSupported(signatureFilePath)) {
      doc.image(signatureFilePath, 546, 232, {
        fit: [170, 42],
        align: "left",
        valign: "center"
      });
    } else {
      doc.font(italicFont).fontSize(24).fillColor("#10211b").text(directorName, 546, 240, {
        width: 180
      });
    }

    doc.moveTo(546, 278).lineTo(726, 278).lineWidth(1).strokeColor("#d8ccb5").stroke();
    doc.font(boldFont).fontSize(14).fillColor("#10211b").text(directorName, 546, 286, {
      width: 188
    });
    doc.font(regularFont).fontSize(11).fillColor("#6d7b76").text(directorTitle, 546, 304, {
      width: 188
    });

    doc.roundedRect(522, 326, 248, 108, 24).fill("#17362d");
    doc.font(regularFont).fontSize(10).fillColor("#b7cec6").text("КОД ПРОВЕРКИ", 546, 348, {
      characterSpacing: 1.8
    });
    doc.font(boldFont).fontSize(20).fillColor("#f4c074").text(verificationCode, 546, 366, {
      characterSpacing: 1.2
    });
    doc.font(regularFont).fontSize(11).fillColor("#ffffff").text("Проверить сертификат можно по ссылке реестра компании.", 546, 394, {
      width: 188,
      lineGap: 3
    });

    doc.circle(646, 490, 64).fillAndStroke("#fffaf1", "#d8ccb5");
    doc.circle(646, 490, 48).lineWidth(1).strokeColor("#e0b47c").stroke();
    doc.font(regularFont).fontSize(9).fillColor("#6d7b76").text(company.name, 603, 468, {
      width: 86,
      align: "center"
    });
    doc.font(boldFont).fontSize(12).fillColor("#10211b").text("ПОДТВЕРЖДЁННЫЙ", 595, 490, {
      width: 102,
      align: "center"
    });
    doc.font(boldFont).fontSize(12).fillColor("#10211b").text("СЕРТИФИКАТ", 595, 506, {
      width: 102,
      align: "center"
    });

    doc.font(regularFont).fontSize(8).fillColor("#6d7b76").text(`Проверка: ${verificationUrl}`, 72, 552, {
      width: 420
    });
    doc.font(regularFont).fontSize(8).fillColor("#6d7b76").text(
      `SHA-256: ${digestPreview} · полный отпечаток хранится в системе`,
      400,
      552,
      {
        width: 340,
        align: "right"
      }
    );

    doc.end();
  });
}

async function loadCertificateContext(courseId, userId) {
  const [course, user, existingCertificate] = await Promise.all([
    prisma.course.findFirst({
      where: {
        id: courseId
      },
      include: {
        company: true,
        modules: {
          include: {
            lessons: {
              select: {
                id: true
              }
            }
          }
        }
      }
    }),
    prisma.user.findUnique({
      where: {
        id: userId
      }
    }),
    prisma.certificate.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId
        }
      }
    })
  ]);

  if (!course || !user) {
    throw new Error("Невозможно сформировать сертификат: курс или пользователь не найден");
  }

  return {
    course,
    user,
    existingCertificate
  };
}

async function ensureCourseCompleted(course, userId) {
  const lessonIds = course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id));
  const totalLessons = countLessons(course.modules);

  const completedLessons = await prisma.progress.count({
    where: {
      userId,
      lessonId: {
        in: lessonIds
      },
      completed: true
    }
  });

  if (totalLessons === 0 || completedLessons < totalLessons) {
    throw new Error("Сертификат нельзя выдать до полного завершения курса");
  }
}

function certificateAssetsReady(certificate) {
  if (!certificate?.certificateUrl || !certificate?.verificationCode || !certificate?.signatureDigest) {
    return false;
  }

  const htmlFilePath = getUploadFilePath(certificate.certificateUrl);
  const pdfFilePath = getCertificatePdfPath(certificate.certificateUrl);

  return Boolean(
    htmlFilePath &&
      pdfFilePath &&
      fs.existsSync(htmlFilePath) &&
      fs.existsSync(pdfFilePath)
  );
}

async function generateCertificateArtifacts({
  companyId,
  courseId,
  userId,
  requestedById = null
}) {
  const { course, user, existingCertificate } = await loadCertificateContext(courseId, userId);
  await ensureCourseCompleted(course, user.id);

  if (existingCertificate && certificateAssetsReady(existingCertificate)) {
    return serializeCertificate(existingCertificate);
  }

  const issuedAt = existingCertificate?.issuedAt ?? new Date();
  const verificationCode =
    existingCertificate?.verificationCode ?? (await generateUniqueVerificationCode());
  const verificationKey = await ensureCompanyVerificationKey(course.company);
  const signatureDigest = buildSignatureDigest({
    verificationCode,
    companyId: course.company.id,
    courseId: course.id,
    userId: user.id,
    issuedAt,
    verificationKey
  });

  const baseFileName = `certificate-${course.id}-${user.id}-${Date.now()}-${sanitizeFileName(course.title)}`;
  const htmlFileName = `${baseFileName}.html`;
  const pdfFileName = `${baseFileName}.pdf`;
  const htmlFilePath = path.join(config.uploadDir, "certificates", htmlFileName);
  const pdfFilePath = path.join(config.uploadDir, "certificates", pdfFileName);
  const certificateUrl = `/uploads/certificates/${htmlFileName}`;
  const html = buildPremiumCertificateHtml({
    company: course.company,
    course,
    user,
    issuedAt,
    verificationCode,
    signatureDigest
  });

  await writeTextFile(htmlFilePath, html);
  await writePremiumPdfCertificate(pdfFilePath, {
    company: course.company,
    course,
    user,
    issuedAt,
    verificationCode,
    signatureDigest
  });

  const certificate = await prisma.certificate.upsert({
    where: {
      userId_courseId: {
        userId: user.id,
        courseId: course.id
      }
    },
    update: {
      issuedAt,
      certificateUrl,
      verificationCode,
      signatureDigest,
      signedByName: course.company.directorName || "Директор компании",
      signedByTitle: course.company.directorTitle || "Генеральный директор"
    },
    create: {
      userId: user.id,
      courseId: course.id,
      issuedAt,
      certificateUrl,
      verificationCode,
      signatureDigest,
      signedByName: course.company.directorName || "Директор компании",
      signedByTitle: course.company.directorTitle || "Генеральный директор"
    }
  });

  await recordAuditEvent({
    companyId: course.company.id,
    actorId: requestedById ?? user.id,
    action: "certificate.generated",
    entityType: "certificate",
    entityId: certificate.id,
    metadata: {
      courseId: course.id,
      certificateUrl,
      pdfUrl: getCertificatePdfUrl(certificateUrl),
      verificationCode
    }
  });

  return serializeCertificate(certificate);
}

export async function ensureCertificateReady({
  companyId,
  courseId,
  userId,
  requestedById = null
}) {
  return generateCertificateArtifacts({
    companyId,
    courseId,
    userId,
    requestedById
  });
}

export async function listUserCertificates(companyId, userId) {
  const certificates = await prisma.certificate.findMany({
    where: {
      userId,
      course: {
        companyId
      }
    },
    include: {
      course: {
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    },
    orderBy: {
      issuedAt: "desc"
    }
  });

  return certificates.map(serializeCertificateListItem);
}

const buildExportFileName = (certificate) => {
  const courseTitle = sanitizeFileName(certificate.course?.title || `course-${certificate.courseId}`);
  const issuedDate = new Intl.DateTimeFormat("sv-SE").format(new Date(certificate.issuedAt));
  return `${courseTitle}-${issuedDate}.pdf`;
};

export async function exportUserCertificates(companyId, userId, certificateIds, requestedById) {
  const uniqueCertificateIds = [...new Set(certificateIds)];
  const certificates = await prisma.certificate.findMany({
    where: {
      id: {
        in: uniqueCertificateIds
      },
      userId,
      course: {
        companyId
      }
    },
    include: {
      course: {
        include: {
          company: true
        }
      }
    }
  });

  if (certificates.length !== uniqueCertificateIds.length) {
    throw badRequest("Часть выбранных сертификатов недоступна для выгрузки");
  }

  const readyCertificates = [];

  for (const certificate of certificates) {
    const readyCertificate = certificateAssetsReady(certificate)
      ? certificate
      : await prisma.certificate.findUnique({
          where: {
            userId_courseId: {
              userId,
              courseId: certificate.courseId
            }
          }
        });

    if (!readyCertificate || !certificateAssetsReady(readyCertificate)) {
      await ensureCertificateReady({
        companyId,
        courseId: certificate.courseId,
        userId,
        requestedById
      });
    }

    const refreshedCertificate = await prisma.certificate.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: certificate.courseId
        }
      },
      include: {
        course: {
          include: {
            company: true
          }
        }
      }
    });

    if (!refreshedCertificate || !certificateAssetsReady(refreshedCertificate)) {
      throw badRequest(`Не удалось подготовить сертификат по курсу «${certificate.course.title}»`);
    }

    readyCertificates.push(refreshedCertificate);
  }

  const exportFileName = `certificates-${userId}-${Date.now()}.zip`;
  const exportDirectory = path.join(config.uploadDir, "exports");
  const exportPath = path.join(exportDirectory, exportFileName);

  await ensureDirectory(exportDirectory);

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(exportPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }
    });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);

    readyCertificates.forEach((certificate) => {
      const pdfPath = getCertificatePdfPath(certificate.certificateUrl);

      if (!pdfPath || !fs.existsSync(pdfPath)) {
        return;
      }

      archive.file(pdfPath, {
        name: buildExportFileName(certificate)
      });
    });

    archive.finalize();
  });

  await recordAuditEvent({
    companyId,
    actorId: requestedById ?? userId,
    action: "certificate.exported",
    entityType: "certificate_export",
    entityId: exportFileName,
    metadata: {
      certificateIds: uniqueCertificateIds,
      count: readyCertificates.length
    }
  });

  return {
    fileUrl: `/uploads/exports/${exportFileName}`,
    count: readyCertificates.length
  };
}

export async function queueCertificateGeneration({
  companyId,
  courseId,
  userId,
  requestedById = null
}) {
  const existingCertificate = await prisma.certificate.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId
      }
    }
  });

  if (existingCertificate && certificateAssetsReady(existingCertificate)) {
    return serializeCertificate(existingCertificate);
  }

  const job = await enqueueBackgroundJob({
    companyId,
    createdById: requestedById ?? userId,
    type: CERTIFICATE_JOB_TYPE,
    payload: {
      courseId,
      userId
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: requestedById ?? userId,
    action: "certificate.queued",
    entityType: "background_job",
    entityId: job.id,
    metadata: {
      courseId,
      userId
    }
  });

  return job;
}

export async function processCertificateGenerationJob(payload, job) {
  return generateCertificateArtifacts({
    companyId: job.companyId ?? 0,
    courseId: payload.courseId,
    userId: payload.userId,
    requestedById: job.createdById ?? payload.userId
  });
}

export async function verifyCertificateByCode(verificationCode) {
  const certificate = await prisma.certificate.findUnique({
    where: {
      verificationCode
    },
    include: {
      user: {
        select: {
          id: true,
          name: true
        }
      },
      course: {
        select: {
          id: true,
          title: true,
          company: true
        }
      }
    }
  });

  if (!certificate) {
    throw notFound("Сертификат не найден");
  }

  const expectedDigest = buildSignatureDigest({
    verificationCode: certificate.verificationCode,
    companyId: certificate.course.company.id,
    courseId: certificate.course.id,
    userId: certificate.user.id,
    issuedAt: certificate.issuedAt,
    verificationKey: certificate.course.company.certificateVerificationKey ?? ""
  });

  return {
    verified: expectedDigest === certificate.signatureDigest,
    certificate: {
      ...serializeCertificate(certificate),
      verificationUrl: buildVerificationUrl(certificate.verificationCode),
      digestPreview: buildDigestPreview(certificate.signatureDigest),
      user: certificate.user,
      course: {
        id: certificate.course.id,
        title: certificate.course.title
      },
      company: {
        id: certificate.course.company.id,
        name: certificate.course.company.name
      }
    }
  };
}

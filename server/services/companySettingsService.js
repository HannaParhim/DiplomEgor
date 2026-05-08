import crypto from "node:crypto";
import prisma from "../database/prisma.js";
import { notFound } from "../utils/errors.js";
import { recordAuditEvent } from "./auditService.js";

export const canManageCompanySettings = (source = {}) => {
  const permissions = source.permissions ?? source;
  return Boolean(permissions?.manage_users || permissions?.manage_roles);
};

export const canManageCompanyFocus = (source = {}) => {
  const permissions = source.permissions ?? source;
  return Boolean(
    permissions?.manage_company_focus ||
      permissions?.manage_users ||
      permissions?.manage_roles
  );
};

const hasOwn = (payload, field) =>
  Object.prototype.hasOwnProperty.call(payload ?? {}, field);

const resolveField = (payload, field, fallback) =>
  hasOwn(payload, field) ? payload[field] : fallback;

export const serializeCompany = (company, { includeSensitive = false } = {}) =>
  company
    ? {
        id: company.id,
        name: company.name,
        logo: company.logo,
        focusTitle: company.focusTitle,
        focusDescription: company.focusDescription,
        ...(includeSensitive
          ? {
              domain: company.domain,
              directorName: company.directorName,
              directorTitle: company.directorTitle,
              directorSignatureUrl: company.directorSignatureUrl
            }
          : {})
      }
    : null;

export const serializeCompanyFocus = (company) =>
  company
    ? {
        focusTitle: company.focusTitle,
        focusDescription: company.focusDescription
      }
    : null;

export async function getCompanySettings(companyId) {
  const company = await prisma.company.findUnique({
    where: {
      id: companyId
    }
  });

  if (!company) {
    throw notFound("Компания не найдена");
  }

  return serializeCompany(company, { includeSensitive: true });
}

export async function getCompanyFocus(companyId) {
  const company = await prisma.company.findUnique({
    where: {
      id: companyId
    }
  });

  if (!company) {
    throw notFound("Компания не найдена");
  }

  return serializeCompanyFocus(company);
}

export async function updateCompanySettings(companyId, payload, currentUserId = null) {
  const company = await prisma.company.findUnique({
    where: {
      id: companyId
    }
  });

  if (!company) {
    throw notFound("Компания не найдена");
  }

  const updatedCompany = await prisma.company.update({
    where: {
      id: companyId
    },
    data: {
      name: resolveField(payload, "name", company.name),
      logo: resolveField(payload, "logo", company.logo),
      directorName: resolveField(payload, "directorName", company.directorName),
      directorTitle: resolveField(payload, "directorTitle", company.directorTitle),
      directorSignatureUrl: resolveField(
        payload,
        "directorSignatureUrl",
        company.directorSignatureUrl
      ),
      certificateVerificationKey:
        payload.rotateVerificationKey === true || !company.certificateVerificationKey
          ? crypto.randomUUID().replace(/-/g, "")
          : company.certificateVerificationKey
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "company.settings_updated",
    entityType: "company",
    entityId: companyId,
    metadata: {
      rotatedKey: payload.rotateVerificationKey === true
    }
  });

  return serializeCompany(updatedCompany, { includeSensitive: true });
}

export async function updateCompanyFocus(companyId, payload, currentUserId = null) {
  const company = await prisma.company.findUnique({
    where: {
      id: companyId
    }
  });

  if (!company) {
    throw notFound("Компания не найдена");
  }

  const updatedCompany = await prisma.company.update({
    where: {
      id: companyId
    },
    data: {
      focusTitle: resolveField(payload, "focusTitle", company.focusTitle),
      focusDescription: resolveField(
        payload,
        "focusDescription",
        company.focusDescription
      )
    }
  });

  await recordAuditEvent({
    companyId,
    actorId: currentUserId,
    action: "company.focus_updated",
    entityType: "company",
    entityId: companyId,
    metadata: {
      focusTitle: updatedCompany.focusTitle
    }
  });

  return serializeCompanyFocus(updatedCompany);
}

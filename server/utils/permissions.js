export const PERMISSION_KEYS = [
  "manage_users",
  "manage_company_focus",
  "create_courses",
  "edit_courses",
  "delete_courses",
  "assign_courses",
  "view_reports",
  "manage_roles",
  "manage_departments",
  "chat_view_thread_settings",
  "chat_upload_attachments",
  "chat_manage_thread_settings",
  "chat_close_threads",
  "chat_assign_threads"
];

const DEFAULT_GRANTED_PERMISSIONS = new Set(["chat_upload_attachments"]);

export const basePermissions = Object.fromEntries(
  PERMISSION_KEYS.map((permission) => [
    permission,
    DEFAULT_GRANTED_PERMISSIONS.has(permission)
  ])
);

export const administratorPermissions = Object.fromEntries(
  PERMISSION_KEYS.map((permission) => [permission, true])
);

export const managerPermissions = {
  ...basePermissions,
  manage_users: true,
  manage_company_focus: true,
  create_courses: true,
  edit_courses: true,
  assign_courses: true,
  view_reports: true,
  manage_departments: true,
  chat_view_thread_settings: true,
  chat_manage_thread_settings: true,
  chat_close_threads: true,
  chat_assign_threads: true
};

export const hrPermissions = {
  ...basePermissions,
  manage_users: true,
  manage_company_focus: true,
  assign_courses: true,
  view_reports: true,
  manage_roles: true,
  manage_departments: true,
  chat_view_thread_settings: true,
  chat_manage_thread_settings: true,
  chat_close_threads: true,
  chat_assign_threads: true
};

export const employeePermissions = {
  ...basePermissions
};

const LEGACY_CHAT_PERMISSION_FALLBACKS = [
  "manage_users",
  "manage_departments",
  "manage_roles",
  "assign_courses",
  "view_reports",
  "create_courses",
  "edit_courses",
  "delete_courses"
];

const applyLegacyChatFallbacks = (sourcePermissions, parsedPermissions) => {
  const hasLegacyManagementAccess = LEGACY_CHAT_PERMISSION_FALLBACKS.some(
    (permission) => sourcePermissions?.[permission]
  );

  if (!hasLegacyManagementAccess) {
    return parsedPermissions;
  }

  const nextPermissions = { ...parsedPermissions };

  if (!Object.prototype.hasOwnProperty.call(sourcePermissions, "chat_manage_thread_settings")) {
    nextPermissions.chat_manage_thread_settings = true;
  }

  if (!Object.prototype.hasOwnProperty.call(sourcePermissions, "chat_view_thread_settings")) {
    nextPermissions.chat_view_thread_settings = true;
  }

  if (!Object.prototype.hasOwnProperty.call(sourcePermissions, "chat_close_threads")) {
    nextPermissions.chat_close_threads = true;
  }

  if (!Object.prototype.hasOwnProperty.call(sourcePermissions, "chat_assign_threads")) {
    nextPermissions.chat_assign_threads = true;
  }

  if (!Object.prototype.hasOwnProperty.call(sourcePermissions, "manage_company_focus")) {
    nextPermissions.manage_company_focus = true;
  }

  return nextPermissions;
};

export const parsePermissions = (value) => {
  if (!value) {
    return { ...basePermissions };
  }

  if (typeof value === "object") {
    return applyLegacyChatFallbacks(value, {
      ...basePermissions,
      ...value
    });
  }

  try {
    const parsedValue = JSON.parse(value);

    return applyLegacyChatFallbacks(parsedValue, {
      ...basePermissions,
      ...parsedValue
    });
  } catch {
    return { ...basePermissions };
  }
};

export const toPermissionJson = (value = {}) =>
  JSON.stringify({ ...basePermissions, ...value });

export const hasPermission = (permissions, permission) =>
  Boolean(parsePermissions(permissions)[permission]);

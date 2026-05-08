import { forbidden } from "../utils/errors.js";

export const roleMiddleware = (...requiredPermissions) => (req, res, next) => {
  if (!requiredPermissions.length) {
    return next();
  }

  const permissions = req.user?.permissions ?? {};
  const missingPermissions = requiredPermissions.filter(
    (permission) => !permissions[permission]
  );

  if (missingPermissions.length > 0) {
    return next(
      forbidden(`Недостаточно прав: ${missingPermissions.join(", ")}`)
    );
  }

  return next();
};

export const roleMiddlewareAny = (...requiredPermissions) => (req, res, next) => {
  if (!requiredPermissions.length) {
    return next();
  }

  const permissions = req.user?.permissions ?? {};
  const hasAnyPermission = requiredPermissions.some(
    (permission) => permissions[permission]
  );

  if (!hasAnyPermission) {
    return next(
      forbidden(`Нужно хотя бы одно из прав: ${requiredPermissions.join(", ")}`)
    );
  }

  return next();
};

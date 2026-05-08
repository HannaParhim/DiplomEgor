import { forbidden } from "../utils/errors.js";

export const companyMiddleware = (req, res, next) => {
  if (!req.user?.companyId) {
    return next(forbidden("Не удалось определить компанию пользователя"));
  }

  const headerCompanyId = req.headers["x-company-id"];

  if (headerCompanyId && Number(headerCompanyId) !== req.user.companyId) {
    return next(forbidden("Доступ к данным другой компании запрещён"));
  }

  req.companyId = req.user.companyId;
  return next();
};

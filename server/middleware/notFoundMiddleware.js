import { notFound } from "../utils/errors.js";

export const notFoundMiddleware = (req, res, next) => {
  next(notFound(`Маршрут ${req.originalUrl} не найден`));
};

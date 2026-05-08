import { badRequest } from "../utils/errors.js";

export const validateRequest = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    return next(
      badRequest(
        result.error.issues[0]?.message ?? "Проверьте корректность заполнения формы",
        result.error.flatten()
      )
    );
  }

  req[source] = result.data;
  return next();
};

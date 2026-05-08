import { badRequest } from "./errors.js";

export const parseId = (value, label = "Идентификатор") => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${label} должен быть положительным целым числом`);
  }

  return parsed;
};

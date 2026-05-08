export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, details);
export const unauthorized = (message = "Требуется авторизация") => new ApiError(401, message);
export const forbidden = (message = "Доступ запрещён") => new ApiError(403, message);
export const notFound = (message = "Ресурс не найден") => new ApiError(404, message);

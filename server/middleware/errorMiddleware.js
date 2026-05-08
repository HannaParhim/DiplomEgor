export const errorMiddleware = (error, req, res, next) => {
  const statusCode = error.statusCode ?? 500;

  if (!res.headersSent) {
    res.status(statusCode).json({
      message: error.message ?? "Внутренняя ошибка сервера",
      details: error.details ?? undefined
    });
  } else {
    next(error);
  }
};

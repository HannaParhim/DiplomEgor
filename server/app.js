import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from 'path';
import { fileURLToPath } from 'url';
import config from "./config/index.js";
import apiRoutes from "./routes/index.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import { notFoundMiddleware } from "./middleware/notFoundMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
      req.method === "OPTIONS" ||
      req.path === "/me" ||
      Boolean(req.headers.authorization),
  message: {
    message: "Слишком много попыток входа. Попробуйте позже."
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
      req.method === "OPTIONS" ||
      req.path.startsWith("/auth") ||
      Boolean(req.headers.authorization),
  message: {
    message: "Слишком много запросов. Попробуйте позже."
  }
});

app.use(
    cors({
      origin: config.clientUrl,
      credentials: true
    })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(config.uploadDir));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter, apiRoutes);

// ---------- РАЗДАЧА СТАТИКИ КЛИЕНТА (production) ----------
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuildPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
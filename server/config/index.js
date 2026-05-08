import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  databaseUrl: process.env.DATABASE_URL ?? 'file:../../database/database.sqlite',
  uploadDir: process.env.UPLOAD_DIR
    ? path.resolve(projectRoot, process.env.UPLOAD_DIR)
    : path.resolve(projectRoot, "uploads"),
  logDir: process.env.LOG_DIR
    ? path.resolve(projectRoot, process.env.LOG_DIR)
    : path.resolve(projectRoot, "logs"),
  isProduction: process.env.NODE_ENV === "production"
};

export default config;

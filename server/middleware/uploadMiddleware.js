import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import config from "../config/index.js";
import { badRequest } from "../utils/errors.js";

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, config.uploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname);
    const safeName = `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`;
    callback(null, safeName);
  }
});

const allowedMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

const signatureMimeTypes = new Set(["image/png", "image/jpeg"]);
const brandImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

const createUploader = (mimeTypes, errorMessage) =>
  multer({
    storage,
    limits: {
      fileSize: 200 * 1024 * 1024
    },
    fileFilter: (_req, file, callback) => {
      if (mimeTypes.has(file.mimetype)) {
        callback(null, true);
        return;
      }

      callback(badRequest(errorMessage));
    }
  }).single("file");

export const uploadSingle = createUploader(
  allowedMimeTypes,
  "Неподдерживаемый тип файла"
);

export const uploadSignatureImage = createUploader(
  signatureMimeTypes,
  "Для подписи директора используйте PNG или JPG"
);

export const uploadLogoImage = createUploader(
  brandImageMimeTypes,
  "Для логотипа используйте PNG, JPG или WEBP"
);

import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest } from "../utils/errors.js";
import { getUploadUrl } from "../services/storageService.js";

export const uploadFileController = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw badRequest("Файл обязателен");
  }

  res.status(201).json({
    fileName: req.file.filename,
    fileUrl: getUploadUrl(req.file.filename),
    mimeType: req.file.mimetype,
    size: req.file.size
  });
});

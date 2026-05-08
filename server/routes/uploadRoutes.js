import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { uploadSingle } from "../middleware/uploadMiddleware.js";
import { uploadFileController } from "../controllers/uploadController.js";
import { forbidden } from "../utils/errors.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.post("/", (req, res, next) => {
  if (
    req.user.permissions.create_courses ||
    req.user.permissions.edit_courses ||
    req.user.permissions.chat_upload_attachments
  ) {
    return next();
  }

  return next(forbidden("Недостаточно прав для загрузки файлов"));
}, uploadSingle, uploadFileController);

export default router;

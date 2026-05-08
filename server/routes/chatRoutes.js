import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { companyMiddleware } from "../middleware/companyMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  createThreadController,
  getChatSummaryController,
  getThreadController,
  listChatContactsController,
  listThreadsController,
  markThreadReadController,
  postMessageController,
  updateThreadController
} from "../controllers/chatController.js";
import {
  chatMessageCreateSchema,
  chatThreadCreateSchema,
  chatThreadUpdateSchema
} from "../utils/validationSchemas.js";

const router = Router();

router.use(authMiddleware, companyMiddleware);

router.get("/contacts", listChatContactsController);
router.get("/summary", getChatSummaryController);
router.get("/threads", listThreadsController);
router.post("/threads", validateRequest(chatThreadCreateSchema), createThreadController);
router.get("/threads/:id", getThreadController);
router.put("/threads/:id", validateRequest(chatThreadUpdateSchema), updateThreadController);
router.post("/threads/:id/messages", validateRequest(chatMessageCreateSchema), postMessageController);
router.post("/threads/:id/read", markThreadReadController);

export default router;

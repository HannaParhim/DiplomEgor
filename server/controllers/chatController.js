import { asyncHandler } from "../utils/asyncHandler.js";
import { parseId } from "../utils/ids.js";
import {
  createThread,
  getChatSummary,
  getThreadById,
  listChatContacts,
  listThreads,
  markThreadRead,
  postMessage,
  updateThread
} from "../services/chatService.js";

export const listChatContactsController = asyncHandler(async (req, res) => {
  const contacts = await listChatContacts(req.companyId, req.user);
  res.json(contacts);
});

export const listThreadsController = asyncHandler(async (req, res) => {
  const threads = await listThreads(req.companyId, req.user);
  res.json(threads);
});

export const getChatSummaryController = asyncHandler(async (req, res) => {
  const summary = await getChatSummary(req.companyId, req.user);
  res.json(summary);
});

export const createThreadController = asyncHandler(async (req, res) => {
  const thread = await createThread(req.companyId, req.user, req.body);
  res.status(201).json(thread);
});

export const getThreadController = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.id, "ID диалога");
  const thread = await getThreadById(req.companyId, threadId, req.user);
  res.json(thread);
});

export const postMessageController = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.id, "ID диалога");
  const thread = await postMessage(req.companyId, threadId, req.user, req.body);
  res.json(thread);
});

export const updateThreadController = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.id, "ID диалога");
  const thread = await updateThread(req.companyId, threadId, req.user, req.body);
  res.json(thread);
});

export const markThreadReadController = asyncHandler(async (req, res) => {
  const threadId = parseId(req.params.id, "ID диалога");
  const result = await markThreadRead(req.companyId, threadId, req.user);
  res.json(result);
});

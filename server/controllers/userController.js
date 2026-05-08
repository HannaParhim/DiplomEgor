import { asyncHandler } from "../utils/asyncHandler.js";
import { parseId } from "../utils/ids.js";
import {
  assignCoursesToUser,
  createUser,
  deleteUser,
  getUserDetails,
  listUsers,
  removeUserAssignment,
  resendUserInvitation,
  resetUserPassword,
  updateUser,
  updateUserAssignment
} from "../services/userService.js";

export const listUsersController = asyncHandler(async (req, res) => {
  const users = await listUsers(req.companyId);
  res.json(users);
});

export const getUserController = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "ID пользователя");
  const user = await getUserDetails(req.companyId, userId);
  res.json(user);
});

export const createUserController = asyncHandler(async (req, res) => {
  const result = await createUser(req.companyId, req.body, req.user.id);
  res.status(201).json(result);
});

export const updateUserController = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "ID пользователя");
  const user = await updateUser(req.companyId, userId, req.body, req.user.id);
  res.json(user);
});

export const assignUserCoursesController = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "ID пользователя");
  const result = await assignCoursesToUser(req.companyId, userId, req.body, req.user.id);
  res.status(201).json(result);
});

export const updateUserAssignmentController = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "ID пользователя");
  const assignmentId = parseId(req.params.assignmentId, "ID назначения");
  const result = await updateUserAssignment(
    req.companyId,
    userId,
    assignmentId,
    req.body,
    req.user.id
  );
  res.json(result);
});

export const deleteUserAssignmentController = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "ID пользователя");
  const assignmentId = parseId(req.params.assignmentId, "ID назначения");
  const result = await removeUserAssignment(req.companyId, userId, assignmentId, req.user.id);
  res.json(result);
});

export const resetUserPasswordController = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "ID пользователя");
  const result = await resetUserPassword(req.companyId, userId, req.user.id);
  res.json(result);
});

export const deleteUserController = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "ID пользователя");
  const result = await deleteUser(req.companyId, userId, req.user.id);
  res.json(result);
});

export const resendInvitationController = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "ID пользователя");
  const result = await resendUserInvitation(req.companyId, userId, req.user.id);
  res.status(202).json(result);
});

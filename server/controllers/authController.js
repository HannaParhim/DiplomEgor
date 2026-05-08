import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getCurrentUser,
  login,
  registerCompany
} from "../services/authService.js";

export const registerCompanyController = asyncHandler(async (req, res) => {
  const result = await registerCompany(req.body);
  res.status(201).json(result);
});

export const loginController = asyncHandler(async (req, res) => {
  const result = await login(req.body);
  res.json(result);
});

export const meController = asyncHandler(async (req, res) => {
  const result = await getCurrentUser(req.user.id, req.companyId);
  res.json(result);
});

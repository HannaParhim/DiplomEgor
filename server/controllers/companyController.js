import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getCompanyFocus,
  getCompanySettings,
  updateCompanyFocus,
  updateCompanySettings
} from "../services/companySettingsService.js";

export const getCompanySettingsController = asyncHandler(async (req, res) => {
  const result = await getCompanySettings(req.companyId);
  res.json(result);
});

export const updateCompanySettingsController = asyncHandler(async (req, res) => {
  const result = await updateCompanySettings(req.companyId, req.body, req.user.id);
  res.json(result);
});

export const getCompanyFocusController = asyncHandler(async (req, res) => {
  const result = await getCompanyFocus(req.companyId);
  res.json(result);
});

export const updateCompanyFocusController = asyncHandler(async (req, res) => {
  const result = await updateCompanyFocus(req.companyId, req.body, req.user.id);
  res.json(result);
});

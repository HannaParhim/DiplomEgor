import { asyncHandler } from "../utils/asyncHandler.js";
import { getDashboardOverview } from "../services/dashboardService.js";

export const dashboardOverviewController = asyncHandler(async (req, res) => {
  const result = await getDashboardOverview(req.user);
  res.json(result);
});

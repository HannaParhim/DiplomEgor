import { asyncHandler } from "../utils/asyncHandler.js";
import { getReportSummary } from "../services/reportService.js";
import {
  listGeneratedReports,
  queueReportGeneration
} from "../services/reportGenerationService.js";

export const reportSummaryController = asyncHandler(async (req, res) => {
  const result = await getReportSummary(req.companyId);
  res.json(result);
});

export const queueReportGenerationController = asyncHandler(async (req, res) => {
  const job = await queueReportGeneration({
    companyId: req.companyId,
    requestedById: req.user.id,
    format: req.body.format,
    kind: req.body.kind
  });

  res.status(202).json(job);
});

export const listGeneratedReportsController = asyncHandler(async (req, res) => {
  const jobs = await listGeneratedReports(req.companyId, {
    limit: req.query.limit,
    status: req.query.status
  });

  res.json(jobs);
});

import { asyncHandler } from "../utils/asyncHandler.js";
import { listAuditLogs } from "../services/auditService.js";

export const listAuditLogsController = asyncHandler(async (req, res) => {
  const logs = await listAuditLogs(req.companyId, {
    limit: req.query.limit,
    action: req.query.action,
    entityType: req.query.entityType,
    actorId: req.query.actorId ? Number(req.query.actorId) : undefined
  });

  res.json(logs);
});

import path from "node:path";
import config from "../config/index.js";
import { enqueueBackgroundJob } from "./backgroundJobService.js";
import { appendJsonLine } from "../utils/storage.js";

export const NOTIFICATION_JOB_TYPE = "notification_dispatch";

export async function queueNotification({
  companyId,
  triggeredById = null,
  recipients = [],
  title,
  body,
  category = "general",
  metadata = {}
}) {
  const uniqueRecipients = [...new Set(recipients.filter(Boolean))];

  if (!companyId || uniqueRecipients.length === 0 || !title) {
    return null;
  }

  return enqueueBackgroundJob({
    companyId,
    createdById: triggeredById,
    type: NOTIFICATION_JOB_TYPE,
    payload: {
      recipients: uniqueRecipients,
      title,
      body,
      category,
      metadata
    }
  });
}

export async function processNotificationJob(payload, job) {
  const logFilePath = path.join(config.logDir, "notifications.log");

  await appendJsonLine(logFilePath, {
    jobId: job.id,
    deliveredAt: new Date().toISOString(),
    ...payload
  });

  return {
    delivered: payload.recipients?.length ?? 0
  };
}

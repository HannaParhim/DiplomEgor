import { registerBackgroundJobProcessor, startBackgroundJobWorker } from "./backgroundJobService.js";
import { processNotificationJob, NOTIFICATION_JOB_TYPE } from "./notificationService.js";
import { processInvitationEmailJob, INVITATION_EMAIL_JOB_TYPE } from "./invitationService.js";
import { processCertificateGenerationJob, CERTIFICATE_JOB_TYPE } from "./certificateService.js";
import { processReportGenerationJob, REPORT_GENERATION_JOB_TYPE } from "./reportGenerationService.js";

let initialized = false;

export function bootstrapBackgroundJobs() {
  if (initialized) {
    return;
  }

  registerBackgroundJobProcessor(NOTIFICATION_JOB_TYPE, processNotificationJob);
  registerBackgroundJobProcessor(INVITATION_EMAIL_JOB_TYPE, processInvitationEmailJob);
  registerBackgroundJobProcessor(CERTIFICATE_JOB_TYPE, processCertificateGenerationJob);
  registerBackgroundJobProcessor(REPORT_GENERATION_JOB_TYPE, processReportGenerationJob);

  startBackgroundJobWorker();
  initialized = true;
}

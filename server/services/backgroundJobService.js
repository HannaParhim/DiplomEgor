import prisma from "../database/prisma.js";

const processors = new Map();
let workerTimer = null;
let runInProgress = false;

export const JOB_STATUSES = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed"
};

const safeStringify = (value) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
};

const safeParse = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

const serializeJob = (job) => ({
  id: job.id,
  companyId: job.companyId,
  type: job.type,
  status: job.status,
  payload: safeParse(job.payload),
  result: safeParse(job.result),
  errorMessage: job.errorMessage,
  attempts: job.attempts,
  availableAt: job.availableAt,
  processedAt: job.processedAt,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  createdBy: job.creator
    ? {
        id: job.creator.id,
        name: job.creator.name,
        email: job.creator.email
      }
    : null
});

export async function enqueueBackgroundJob({
  companyId = null,
  createdById = null,
  type,
  payload,
  availableAt = new Date()
}) {
  const job = await prisma.backgroundJob.create({
    data: {
      companyId,
      createdById,
      type,
      payload: safeStringify(payload),
      availableAt
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  return serializeJob(job);
}

export async function listBackgroundJobs(
  companyId,
  { limit = 50, type, status } = {}
) {
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      companyId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {})
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: Math.min(Math.max(Number(limit) || 50, 1), 200)
  });

  return jobs.map(serializeJob);
}

export function registerBackgroundJobProcessor(type, handler) {
  processors.set(type, handler);
}

const reserveNextJobs = async (batchSize) => {
  const candidates = await prisma.backgroundJob.findMany({
    where: {
      status: {
        in: [JOB_STATUSES.PENDING, JOB_STATUSES.FAILED]
      },
      availableAt: {
        lte: new Date()
      },
      attempts: {
        lt: 5
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    take: batchSize
  });

  const reservedJobs = [];

  for (const candidate of candidates) {
    const reserved = await prisma.backgroundJob.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status
      },
      data: {
        status: JOB_STATUSES.PROCESSING,
        attempts: {
          increment: 1
        }
      }
    });

    if (reserved.count > 0) {
      reservedJobs.push(
        await prisma.backgroundJob.findUnique({
          where: {
            id: candidate.id
          }
        })
      );
    }
  }

  return reservedJobs.filter(Boolean);
};

async function processJob(job) {
  const processor = processors.get(job.type);

  if (!processor) {
    await prisma.backgroundJob.update({
      where: {
        id: job.id
      },
      data: {
        status: JOB_STATUSES.FAILED,
        errorMessage: `Нет обработчика для типа задачи ${job.type}`
      }
    });
    return;
  }

  try {
    const result = await processor(safeParse(job.payload), job);

    await prisma.backgroundJob.update({
      where: {
        id: job.id
      },
      data: {
        status: JOB_STATUSES.COMPLETED,
        result: safeStringify(result),
        errorMessage: null,
        processedAt: new Date()
      }
    });
  } catch (error) {
    await prisma.backgroundJob.update({
      where: {
        id: job.id
      },
      data: {
        status: JOB_STATUSES.FAILED,
        errorMessage: error instanceof Error ? error.message : "Неизвестная ошибка",
        availableAt: new Date(Date.now() + Math.min(300000, 30000 * (job.attempts + 1)))
      }
    });
  }
}

export async function runBackgroundJobs(batchSize = 5) {
  if (runInProgress) {
    return;
  }

  runInProgress = true;

  try {
    const jobs = await reserveNextJobs(batchSize);

    for (const job of jobs) {
      await processJob(job);
    }
  } finally {
    runInProgress = false;
  }
}

export function startBackgroundJobWorker(intervalMs = 5000) {
  if (workerTimer) {
    return;
  }

  workerTimer = setInterval(() => {
    runBackgroundJobs().catch((error) => {
      console.error("Background job worker failed", error);
    });
  }, intervalMs);

  setTimeout(() => {
    runBackgroundJobs().catch((error) => {
      console.error("Initial background job run failed", error);
    });
  }, 250);
}

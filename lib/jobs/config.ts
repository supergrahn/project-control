import os from 'os'

export const JOB_CONFIG = {
  intervalMs:     Number(process.env.JOB_INTERVAL_MS ?? 15_000),
  batchSize:      Number(process.env.JOB_BATCH_SIZE ?? 4),
  loadAverageMax: Number(process.env.JOB_LOAD_MAX ?? Math.max(1, os.cpus().length * 0.8)),
}

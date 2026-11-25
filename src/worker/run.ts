/* Starts pg-boss consumers + cron schedules. Used by the standalone worker and, on free hosting, inside the web process. */
import { getBoss } from "./boss";
import { JOBS } from "./jobs";
import { logger } from "@/lib/logger";

let started = false;

export async function startWorker() {
  if (started) return;
  started = true;
  const boss = await getBoss();
  for (const [name, def] of Object.entries(JOBS)) {
    await boss.createQueue(name).catch(() => {});
    await boss.work(name, { batchSize: 1 }, async ([job]) => {
      const t0 = Date.now();
      try {
        const result = await def.handler(job.data);
        logger.info({ job: name, id: job.id, ms: Date.now() - t0, result: typeof result === "number" ? result : undefined }, "job done");
      } catch (err) {
        logger.error({ job: name, id: job.id, err }, "job failed");
        throw err;
      }
    });
    if (def.cron) await boss.schedule(name, def.cron, {}, { tz: "Asia/Manila", retryLimit: 2 });
  }
  logger.info({ jobs: Object.keys(JOBS) }, "worker started");
  return boss;
}

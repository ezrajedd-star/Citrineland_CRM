/* Background worker: pg-boss queues + cron (Postgres-backed, no Redis). Run with `npm run worker`. */
import { getBoss } from "./boss";
import { JOBS } from "./jobs";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

async function main() {
  const boss = await getBoss();
  for (const [name, def] of Object.entries(JOBS)) {
    await boss.createQueue(name).catch(() => {});
    await boss.work(name, { batchSize: 1 }, async ([job]) => {
      const started = Date.now();
      try {
        const result = await def.handler(job.data);
        logger.info({ job: name, id: job.id, ms: Date.now() - started, result: typeof result === "number" ? result : undefined }, "job done");
      } catch (err) {
        logger.error({ job: name, id: job.id, err }, "job failed");
        throw err;
      }
    });
    if (def.cron) await boss.schedule(name, def.cron, {}, { tz: "Asia/Manila", retryLimit: 2 });
  }
  logger.info({ jobs: Object.keys(JOBS) }, "worker started");
  const shutdown = async () => {
    logger.info("worker stopping");
    await boss.stop({ graceful: true, timeout: 20_000 });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  logger.error({ err: e }, "worker crashed");
  process.exit(1);
});

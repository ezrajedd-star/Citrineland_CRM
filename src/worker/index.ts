/* Background worker: pg-boss queues + cron (Postgres-backed, no Redis). Run with `npm run worker`. */
import { startWorker } from "./run";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

async function main() {
  const boss = await startWorker();
  const shutdown = async () => {
    logger.info("worker stopping");
    await boss?.stop({ graceful: true, timeout: 20_000 });
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

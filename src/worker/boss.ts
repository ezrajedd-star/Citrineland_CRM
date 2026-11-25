import PgBoss from "pg-boss";

let boss: PgBoss | null = null;

/** Shared pg-boss instance (used by the worker, and by the web app to enqueue jobs). */
export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const isWorker = process.env.SERVICE_NAME === "worker" || process.env.RUN_WORKER_IN_WEB === "true" || process.argv.some((a) => a.includes("worker"));
  const b = new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: "pgboss",
    application_name: process.env.SERVICE_NAME ?? "citrineland",
    // Only the worker process runs maintenance and cron; the web app just enqueues.
    supervise: isWorker,
    schedule: isWorker,
    max: isWorker ? 10 : 3,
  });
  b.on("error", (e) => console.error("pg-boss error", e));
  await b.start();
  boss = b;
  return b;
}

/** Enqueue a job from the web app; failures are logged, not thrown (the cron safety net catches up). */
export async function enqueue(name: string, data: object = {}, options: PgBoss.SendOptions = {}) {
  try {
    const b = await getBoss();
    await b.createQueue(name).catch(() => {});
    return await b.send(name, data, options);
  } catch (e) {
    console.error("enqueue failed", name, e);
    return null;
  }
}

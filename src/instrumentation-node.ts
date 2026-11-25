import { startWorker } from "./worker/run";

if (process.env.RUN_WORKER_IN_WEB === "true") {
  startWorker().catch((e) => console.error("in-process worker failed to start", e));
}

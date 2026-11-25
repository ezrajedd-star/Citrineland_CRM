/**
 * Next.js startup hook. On free hosting there is no separate worker container, so with
 * RUN_WORKER_IN_WEB=true the pg-boss worker (holds expiry, automations, email sync, sequences) runs
 * inside the web process. In production on a Droplet, leave it off and run the `worker` service.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

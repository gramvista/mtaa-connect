import vinextWorker from "vinext/server/fetch-handler";

type WorkerEnvironment = {
  WORKER_SECRET?: string;
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const worker = vinextWorker as {
  fetch(request: Request, env: WorkerEnvironment, context: ExecutionContext): Promise<Response>;
};

const cloudflareWorker = {
  fetch(request: Request, env: WorkerEnvironment, context: ExecutionContext) {
    return worker.fetch(request, env, context);
  },
  scheduled(_controller: unknown, env: WorkerEnvironment, context: ExecutionContext) {
    if (!env.WORKER_SECRET) {
      console.error("Scheduled worker skipped: WORKER_SECRET is not configured");
      return;
    }

    context.waitUntil(
      fetch("https://mtaa.gramvistaempiregroup.com/api/internal/worker", {
        method: "POST",
        headers: { authorization: `Bearer ${env.WORKER_SECRET}` },
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Scheduled worker returned HTTP ${response.status}`);
        }
      }),
    );
  },
};

export default cloudflareWorker;

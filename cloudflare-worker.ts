import vinextWorker from "vinext/server/fetch-handler";
import { dispatchScheduledWorker } from "./src/services/scheduled-worker";

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
      dispatchScheduledWorker(env.WORKER_SECRET,(request)=>worker.fetch(request,env,context)),
    );
  },
};

export default cloudflareWorker;

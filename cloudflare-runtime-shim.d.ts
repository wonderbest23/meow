interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface CloudflareEnv {
  OPENAI_API_KEY: string;
}

type Service<T = unknown> = Fetcher & T;

type WorkflowInstanceStatus =
  | "queued"
  | "running"
  | "paused"
  | "errored"
  | "terminated"
  | "complete"
  | "waiting"
  | "waitingForPause"
  | "unknown";

type WorkflowStatus = {
  status: WorkflowInstanceStatus;
  error?: { name: string; message: string };
  output?: unknown;
};

interface WorkflowInstance {
  id: string;
  status(): Promise<WorkflowStatus>;
}

interface Workflow<PARAMS = unknown> {
  get(id: string): Promise<WorkflowInstance>;
  create(options?: { id?: string; params?: PARAMS }): Promise<WorkflowInstance>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

type ExportedHandler<Env> = {
  fetch(request: Request, env: Env, context: ExecutionContext): Response | Promise<Response>;
};

declare module "cloudflare:workers" {
  export type WorkflowEvent<T> = {
    payload: Readonly<T>;
    timestamp: Date;
    instanceId: string;
    workflowName: string;
  };

  export type WorkflowStep = {
    do<T>(
      name: string,
      config: {
        retries?: {
          limit: number;
          delay: number
            | `${number} ${"second" | "minute" | "hour" | "day" | "week" | "month" | "year"}${"" | "s"}`
            | ((input: { ctx: { attempt: number }; error: Error }) => number | string | Promise<number | string>);
          backoff?: "constant" | "linear" | "exponential";
        };
      },
      callback: () => Promise<T>,
    ): Promise<T>;
  };

  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected env: Env;
    abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}

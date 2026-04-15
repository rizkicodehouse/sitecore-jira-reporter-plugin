import PQueue from "p-queue";

export type JiraQueueOptions = {
  concurrency: number;
  intervalCap: number;
  interval?: number;
};

export class JiraQueue {
  private readonly queue: PQueue;
  constructor(opts: JiraQueueOptions) {
    this.queue = new PQueue({
      concurrency: opts.concurrency,
      intervalCap: opts.intervalCap,
      interval: opts.interval ?? 1000,
      carryoverConcurrencyCount: true
    });
  }
  async add<T>(fn: () => Promise<T>): Promise<T> {
    const result = await this.queue.add(fn);
    return result as T;
  }
  get pending(): number { return this.queue.pending; }
  get size(): number { return this.queue.size; }
}

type QueueGlobals = {
  __jpJiraQueue?: JiraQueue | null;
};
const qg = globalThis as unknown as QueueGlobals;

export function getJiraQueue(): JiraQueue {
  if (!qg.__jpJiraQueue) {
    qg.__jpJiraQueue = new JiraQueue({
      concurrency: 1, intervalCap: 3, interval: 1000
    });
  }
  return qg.__jpJiraQueue;
}

export function resetJiraQueueForTests(): void {
  qg.__jpJiraQueue = null;
}

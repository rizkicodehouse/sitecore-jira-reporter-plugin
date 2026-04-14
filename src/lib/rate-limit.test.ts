// src/lib/rate-limit.test.ts
import { describe, it, expect, vi } from "vitest";
import { JiraQueue } from "./rate-limit";

describe("JiraQueue", () => {
  it("serialises concurrent tasks (concurrency 1)", async () => {
    const q = new JiraQueue({ concurrency: 1, intervalCap: 100 });
    const order: number[] = [];
    const run = (n: number, ms: number) => q.add(async () => {
      await new Promise((r) => setTimeout(r, ms));
      order.push(n);
    });
    await Promise.all([run(1, 30), run(2, 10), run(3, 10)]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("honours intervalCap per second", async () => {
    const q = new JiraQueue({ concurrency: 1, intervalCap: 2 });
    const t0 = Date.now();
    await Promise.all([
      q.add(async () => {}),
      q.add(async () => {}),
      q.add(async () => {})
    ]);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  it("propagates errors from the enqueued task", async () => {
    const q = new JiraQueue({ concurrency: 1, intervalCap: 10 });
    await expect(q.add(async () => { throw new Error("boom"); }))
      .rejects.toThrow("boom");
  });
});

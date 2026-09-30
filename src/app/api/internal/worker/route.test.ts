import { afterEach, describe, expect, it, vi } from "vitest";

const { processSmsQueue } = vi.hoisted(() => ({ processSmsQueue: vi.fn(async () => 2) }));

vi.mock("@/services/sms/queue", () => ({ processSmsQueue }));

import { POST } from "./route";

const originalSecret = process.env.WORKER_SECRET;

afterEach(() => {
  vi.clearAllMocks();
  if (originalSecret === undefined) delete process.env.WORKER_SECRET;
  else process.env.WORKER_SECRET = originalSecret;
});

describe("internal worker endpoint", () => {
  it("does no queue work when the worker secret is missing", async () => {
    delete process.env.WORKER_SECRET;
    const response = await POST(new Request("https://example.test/api/internal/worker", { method: "POST" }));

    expect(response.status).toBe(503);
    expect(processSmsQueue).not.toHaveBeenCalled();
  });

  it("does no queue work for an invalid bearer token", async () => {
    process.env.WORKER_SECRET = "a".repeat(32);
    const response = await POST(
      new Request("https://example.test/api/internal/worker", {
        method: "POST",
        headers: { authorization: `Bearer ${"b".repeat(32)}` },
      }),
    );

    expect(response.status).toBe(401);
    expect(processSmsQueue).not.toHaveBeenCalled();
  });

  it("runs one bounded queue pass for the valid bearer token", async () => {
    const secret = "c".repeat(32);
    process.env.WORKER_SECRET = secret;
    const response = await POST(
      new Request("https://example.test/api/internal/worker", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 2 });
    expect(processSmsQueue).toHaveBeenCalledTimes(1);
    expect(processSmsQueue).toHaveBeenCalledWith();
  });
});

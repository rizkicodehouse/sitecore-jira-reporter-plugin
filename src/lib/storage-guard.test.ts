import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest";
import {
  selectDriver, resetStorageGuardForTests
} from "./storage-guard";

describe("selectDriver", () => {
  beforeEach(() => {
    resetStorageGuardForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'upstash' when REST url is set", () => {
    process.env.UPSTASH_REDIS_REST_URL =
      "https://example.upstash.io";
    expect(
      selectDriver({ source: "s", nodeEnv: "production" })
    ).toBe("upstash");
  });

  it("throws in production without the REST url", () => {
    expect(() =>
      selectDriver({ source: "s", nodeEnv: "production" })
    ).toThrow(
      /Refusing to start with the in-memory driver/
    );
  });

  it("error names the source and cites REST var name",
     () => {
    let message = "";
    try {
      selectDriver({
        source: "reports-store",
        nodeEnv: "production"
      });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/\[reports-store\]/);
    expect(message).toMatch(/UPSTASH_REDIS_REST_URL/);
    expect(message).toMatch(/UPSTASH_REDIS_REST_TOKEN/);
    expect(message).toMatch(/REDIS_URL.*not used/i);
  });

  it("returns 'memory' in non-production", () => {
    expect(
      selectDriver({ source: "s", nodeEnv: "development" })
    ).toBe("memory");
    expect(
      selectDriver({ source: "s", nodeEnv: "test" })
    ).toBe("memory");
  });

  it("warns only once per source per process", () => {
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => {});
    selectDriver({ source: "a", nodeEnv: "test" });
    selectDriver({ source: "a", nodeEnv: "test" });
    selectDriver({ source: "a", nodeEnv: "test" });
    expect(warn).toHaveBeenCalledTimes(1);
    selectDriver({ source: "b", nodeEnv: "test" });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("does not warn when upstash is selected", () => {
    process.env.UPSTASH_REDIS_REST_URL =
      "https://example.upstash.io";
    const warn = vi.spyOn(console, "warn")
      .mockImplementation(() => {});
    selectDriver({ source: "s", nodeEnv: "test" });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

import { describe, it, expect, vi } from "vitest";
import { createScopedFetch } from "./scoped-fetch";

describe("createScopedFetch", () => {
  it("adds x-sc-* headers when context is set", async () => {
    const base = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 })
    );
    const scoped = createScopedFetch({
      tenant: "T", site: "S",
      contextId: "ctx", authToken: "tok",
      fetchImpl: base as unknown as typeof fetch
    });
    await scoped("/api/settings");
    const [, init] = base.mock.calls[0]! as [
      string, RequestInit
    ];
    const headers = new Headers(init.headers);
    expect(headers.get("x-sc-tenant")).toBe("T");
    expect(headers.get("x-sc-site")).toBe("S");
    expect(headers.get("x-sc-context-id")).toBe("ctx");
    expect(headers.get("x-sc-auth-token")).toBe("tok");
  });

  it("merges provided headers", async () => {
    const base = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 })
    );
    const scoped = createScopedFetch({
      tenant: "T", site: "S",
      contextId: "ctx", authToken: "tok",
      fetchImpl: base as unknown as typeof fetch
    });
    await scoped("/api/settings", {
      headers: { "Content-Type": "application/json" }
    });
    const [, init] = base.mock.calls[0]! as [
      string, RequestInit
    ];
    const headers = new Headers(init.headers);
    expect(headers.get("content-type"))
      .toBe("application/json");
    expect(headers.get("x-sc-tenant")).toBe("T");
  });
});

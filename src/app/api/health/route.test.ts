import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns ok true with flags", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      jiraConfigured: boolean;
      settingsLoaded: boolean;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.jiraConfigured).toBe("boolean");
  });
});

import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest";
import { JiraClient } from "./client";

describe("JiraClient", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.stubGlobal("fetch", originalFetch); });

  it("createIssue POSTs to /api/jira/issue with JSON body and credentials",
     async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ key: "CLD-1", url: "http://j/CLD-1" }),
        { status: 201 }
      )
    );
    const c = new JiraClient({ tenantId: "t-1" });
    const out = await c.createIssue({
      summary: "s", descriptionText: "d",
      context: {} as never, attachmentCount: 0
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/jira/issue",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Tenant-Id": "t-1"
        })
      })
    );
    expect(out.key).toBe("CLD-1");
  });

  it("createIssue throws a PluginError on non-2xx",
     async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            category: "config",
            userMessage: "bad",
            logCode: "jira.401.invalid-token"
          }
        }),
        { status: 401 }
      )
    );
    const c = new JiraClient();
    await expect(c.createIssue({
      summary: "s", descriptionText: "",
      context: {} as never, attachmentCount: 0
    })).rejects.toMatchObject({
      category: "config", userMessage: "bad"
    });
  });

  it("uploadAttachment POSTs multipart", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ id: "att-1" }),
        { status: 201 }
      )
    );
    const c = new JiraClient();
    const out = await c.uploadAttachment(
      "CLD-1", new Blob(["x"], { type: "image/png" })
    );
    expect(out.id).toBe("att-1");
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0]!;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
  });
});

import {
  describe, it, expect, beforeEach, vi
} from "vitest";
import {
  resolveJiraUserByEmail,
  looksLikeAccountId,
  looksLikeEmail,
  JiraUserLookupError
} from "./jira-user-search";

describe("looksLikeAccountId", () => {
  it("matches 24-char hex", () => {
    expect(looksLikeAccountId(
      "5c1aed16fbbe6428a7f30aac"
    )).toBe(true);
  });
  it("rejects short or non-hex strings", () => {
    expect(looksLikeAccountId("alice@co.com")).toBe(false);
    expect(looksLikeAccountId("abc")).toBe(false);
    expect(looksLikeAccountId("z".repeat(24))).toBe(false);
  });
});

describe("looksLikeEmail", () => {
  it("matches simple emails", () => {
    expect(looksLikeEmail("alice@co.com")).toBe(true);
  });
  it("rejects missing @", () => {
    expect(looksLikeEmail("alice.co")).toBe(false);
  });
});

describe("resolveJiraUserByEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const OK_USER = {
    accountId: "5c1aed16fbbe6428a7f30aac",
    displayName: "Alice",
    emailAddress: "alice@co.com",
    active: true
  };

  it("returns accountId on exact match", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([OK_USER]),
        { status: 200 })
    ));
    const u = await resolveJiraUserByEmail(
      "https://x.atlassian.net",
      "svc@x.com", "tok", "alice@co.com"
    );
    expect(u.accountId).toBe(OK_USER.accountId);
  });

  it("throws not-found on empty result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("[]", { status: 200 })
    ));
    await expect(resolveJiraUserByEmail(
      "https://x.atlassian.net",
      "svc@x.com", "tok", "ghost@co.com"
    )).rejects.toBeInstanceOf(JiraUserLookupError);
  });

  it("throws ambiguous on multiple non-exact matches",
     async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        { ...OK_USER, emailAddress: "bob@co.com" },
        { ...OK_USER, accountId: "6d2bfe27gccf7539b8g41bbd",
          emailAddress: "carol@co.com" }
      ]), { status: 200 })
    ));
    await expect(resolveJiraUserByEmail(
      "https://x.atlassian.net",
      "svc@x.com", "tok", "alice"
    )).rejects.toThrow(/ambiguous|2 JIRA users/i);
  });

  it("throws auth on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("unauthorized", { status: 401 })
    ));
    await expect(resolveJiraUserByEmail(
      "https://x.atlassian.net",
      "svc@x.com", "tok", "alice@co.com"
    )).rejects.toMatchObject({ reason: "auth" });
  });

  it("throws bad-creds when fields missing", async () => {
    await expect(resolveJiraUserByEmail(
      "", "", "", "alice@co.com"
    )).rejects.toMatchObject({ reason: "bad-creds" });
  });
});

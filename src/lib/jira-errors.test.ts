// src/lib/jira-errors.test.ts
import { describe, it, expect } from "vitest";
import { mapJiraError } from "./jira-errors";

describe("mapJiraError", () => {
  it.each([
    [401, "config",    /not configured correctly/i],
    [403, "config",    /not configured correctly/i],
    [404, "config",    /project not found/i],
    [400, "config",    /JIRA rejected/i],
    [413, "retryable", /too large/i],
    [429, "retryable", /try again/i],
    [500, "retryable", /temporarily unavailable/i],
    [502, "retryable", /temporarily unavailable/i],
    [503, "retryable", /temporarily unavailable/i]
  ])("maps %s → %s", (status, category, userMsg) => {
    const err = mapJiraError({
      status: status as number,
      upstreamBody: { errorMessages: ["x"] }
    });
    expect(err.category).toBe(category);
    expect(err.userMessage).toMatch(userMsg as RegExp);
  });

  it("surfaces Retry-After on 429", () => {
    const err = mapJiraError({
      status: 429,
      upstreamBody: {},
      retryAfterSeconds: 7
    });
    expect(err.userMessage).toContain("7");
    expect(err.retryAfterSeconds).toBe(7);
  });

  it("falls back to unknown on unexpected status", () => {
    const err = mapJiraError({
      status: 418, upstreamBody: {}
    });
    expect(err.category).toBe("unknown");
  });

  it("surfaces JIRA 400 detail from errors map", () => {
    const err = mapJiraError({
      status: 400,
      upstreamBody: {
        errorMessages: [],
        errors: { issuetype: "Issue type is required." }
      }
    });
    expect(err.userMessage)
      .toMatch(/issuetype: Issue type is required/);
  });

  it("surfaces JIRA 400 detail from errorMessages", () => {
    const err = mapJiraError({
      status: 400,
      upstreamBody: {
        errorMessages: ["Project 'SJP' doesn't exist."]
      }
    });
    expect(err.userMessage)
      .toMatch(/Project 'SJP' doesn't exist/);
  });
});

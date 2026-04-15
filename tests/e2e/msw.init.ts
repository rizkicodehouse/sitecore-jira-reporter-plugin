import { http, HttpResponse } from "msw";

export const handlers = {
  jiraIssueOk: http.post(
    "*://*/rest/api/3/issue",
    () => HttpResponse.json({
      key: "MOCK-1", id: "1",
      self: "http://jira/mock/MOCK-1"
    }, { status: 201 })
  ),
  jiraIssue429: http.post(
    "*://*/rest/api/3/issue",
    () => new HttpResponse(null, {
      status: 429, headers: { "Retry-After": "3" }
    })
  )
};

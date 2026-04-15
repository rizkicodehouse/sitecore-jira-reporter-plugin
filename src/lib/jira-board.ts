import { basicAuthHeader } from "./jira-creds";

export type BoardSprintInfo = {
  boardType: "scrum" | "kanban" | "other";
  activeSprintId: number | null;
};

export async function getBoardSprintInfo(
  baseUrl: string,
  serviceEmail: string,
  apiToken: string,
  boardId: number
): Promise<BoardSprintInfo> {
  const auth = basicAuthHeader(serviceEmail, apiToken);
  const headers = {
    Accept: "application/json",
    Authorization: auth
  };
  let boardType: BoardSprintInfo["boardType"] = "other";
  try {
    const r = await fetch(
      `${baseUrl}/rest/agile/1.0/board/${boardId}`,
      { headers }
    );
    if (r.ok) {
      const body = await r.json() as { type?: string };
      if (body.type === "scrum") boardType = "scrum";
      else if (body.type === "kanban") boardType = "kanban";
    }
  } catch { /* leave as other */ }
  if (boardType !== "scrum") {
    return { boardType, activeSprintId: null };
  }
  try {
    const r = await fetch(
      `${baseUrl}/rest/agile/1.0/board/${boardId}` +
      `/sprint?state=active`,
      { headers }
    );
    if (!r.ok) {
      return { boardType, activeSprintId: null };
    }
    const body = await r.json() as {
      values?: Array<{ id?: number }>;
    };
    const first = (body.values ?? [])
      .find((s) => typeof s.id === "number");
    return {
      boardType,
      activeSprintId: first?.id ?? null
    };
  } catch {
    return { boardType, activeSprintId: null };
  }
}

export async function addIssueToSprint(
  baseUrl: string,
  serviceEmail: string,
  apiToken: string,
  sprintId: number,
  issueKey: string
): Promise<boolean> {
  try {
    const r = await fetch(
      `${baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: basicAuthHeader(
            serviceEmail, apiToken
          )
        },
        body: JSON.stringify({ issues: [issueKey] })
      }
    );
    return r.ok;
  } catch {
    return false;
  }
}

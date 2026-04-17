import { describe, it, expect } from "vitest";
import {
  TEMPLATE_ID_FOLDER,
  TEMPLATE_ID_BUG_REPORTER_SETTINGS,
  TEMPLATE_ID_BUG_REPORT,
  settingsConfigPath,
  bugReportsRootPath,
  settingsFolderPath,
  SETTINGS_FIELD,
  REPORT_FIELD
} from "./templates";

describe("sitecore templates", () => {
  it("exposes the Common/Folder template id", () => {
    expect(TEMPLATE_ID_FOLDER).toMatch(
      /^{[0-9A-F-]{36}}$/i
    );
    expect(TEMPLATE_ID_FOLDER).toBe(
      "{A87A00B1-E6DB-45AB-8B54-636FEC3B5523}"
    );
  });

  it("exposes the Feature template ids (non-empty)", () => {
    expect(TEMPLATE_ID_BUG_REPORTER_SETTINGS).toMatch(
      /^{[0-9A-F-]{36}}$/i
    );
    expect(TEMPLATE_ID_BUG_REPORT).toMatch(
      /^{[0-9A-F-]{36}}$/i
    );
  });

  it("builds per-tenant/site paths", () => {
    expect(settingsFolderPath("T", "S")).toBe(
      "/sitecore/content/T/S/Settings/Bug Reporter for Jira"
    );
    expect(settingsConfigPath("T", "S")).toBe(
      "/sitecore/content/T/S/Settings/Bug Reporter for Jira/Config"
    );
    expect(bugReportsRootPath("T", "S")).toBe(
      "/sitecore/content/T/S/Data/Bug Reports"
    );
  });

  it("enumerates field names used by the stores", () => {
    expect(SETTINGS_FIELD.projectKey).toBe("Project Key");
    expect(SETTINGS_FIELD.apiTokenEnc).toBe(
      "API Token Encrypted"
    );
    expect(REPORT_FIELD.ticketKey).toBe("Ticket Key");
    expect(REPORT_FIELD.createdAt).toBe("Created At");
  });
});

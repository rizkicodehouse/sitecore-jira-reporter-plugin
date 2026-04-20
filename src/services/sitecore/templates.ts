// Well-known Sitecore system templates.
export const TEMPLATE_ID_FOLDER =
  "{A87A00B1-E6DB-45AB-8B54-636FEC3B5523}";

// Plugin Feature templates. These GUIDs are produced by
// the Sitecore Content Serialization module that lives
// alongside the plugin deployment and are stable per
// environment. Override at runtime via env if the module
// hasn't been deployed yet.
export const TEMPLATE_ID_BUG_REPORTER_SETTINGS =
  process.env.SITECORE_TEMPLATE_SETTINGS
    ?? "{1F0A8E3B-1D5A-47B6-9E11-0A6E4B81C200}";

export const TEMPLATE_ID_BUG_REPORT =
  process.env.SITECORE_TEMPLATE_BUG_REPORT
    ?? "{2C5E6F1A-8DB4-49D8-9C74-7B3F4A7F11F0}";

export const TEMPLATE_ID_BUCKETABLE_FOLDER =
  process.env.SITECORE_TEMPLATE_BUCKETABLE_FOLDER
    ?? "{33333333-3333-3333-3333-333333333333}";

export function settingsFolderPath(
  tenant: string, site: string
): string {
  return `/sitecore/content/${tenant}/${site}` +
    `/Settings/Bug Reporter for Jira`;
}

export function settingsConfigPath(
  tenant: string, site: string
): string {
  return `${settingsFolderPath(tenant, site)}/Config`;
}

export function bugReportsRootPath(
  tenant: string, site: string
): string {
  return `/sitecore/content/${tenant}/${site}` +
    `/Data/Bug Reports`;
}

export const SETTINGS_FIELD = {
  jiraBaseUrl: "Jira Base URL",
  serviceEmail: "Service Account Email",
  // Avoid parenthesised suffix: Sitecore's item-name regex
  // only allows "(N)" for numeric disambiguation. Template
  // fields are stored as Sitecore items, so a name like
  // "API Token (Encrypted)" fails ItemNameValidation during
  // provisioning.
  apiTokenEnc: "API Token Encrypted",
  projectKey: "Project Key",
  defaultIssueType: "Default Issue Type",
  defaultLabels: "Default Labels",
  boardId: "Target Board ID",
  adminEmails: "Admin Emails"
} as const;

export const REPORT_FIELD = {
  ticketKey: "Ticket Key",
  ticketUrl: "Ticket URL",
  summary: "Summary",
  issueType: "Issue Type",
  pageItemId: "Page Item ID",
  pagePath: "Page Path",
  pageTitle: "Page Title",
  renderingInstanceId: "Rendering Instance ID",
  renderingName: "Rendering Name",
  datasourceItemId: "Data Source Item ID",
  reporter: "Reporter",
  createdAt: "Created At"
} as const;

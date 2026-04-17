// Ensures the plugin's Feature templates exist in Sitecore,
// creating them via Authoring GraphQL if absent. Returns
// stable template IDs that provisioning and the stores use.
//
// This removes the "author the templates in Sitecore first"
// prerequisite from the install flow. Templates are
// idempotent: existing templates are detected by path and
// reused without modification.

import type { XmcClient } from "./xmc";

export const FEATURE_TEMPLATES_ROOT =
  "/sitecore/templates/Feature";

export const PLUGIN_TEMPLATES_FOLDER =
  "/sitecore/templates/Feature/BugReporterJira";

export const SETTINGS_TEMPLATE_PATH =
  `${PLUGIN_TEMPLATES_FOLDER}/BugReporterJiraSettings`;

export const BUG_REPORT_TEMPLATE_PATH =
  `${PLUGIN_TEMPLATES_FOLDER}/BugReport`;

export const TEMPLATE_FOLDER_TEMPLATE_ID =
  "{0437FEE2-44C9-46A6-ABE9-28858D9FEE8C}";

export type ResolvedTemplateIds = {
  settingsTemplateId: string;
  bugReportTemplateId: string;
};

const CREATE_TEMPLATE_MUTATION = `
  mutation CreateItemTemplate($input: CreateItemTemplateInput!) {
    createItemTemplate(input: $input) {
      itemTemplate { templateId name }
    }
  }
`;

type CreateTemplateResponse = {
  createItemTemplate: {
    itemTemplate: { templateId: string; name: string };
  };
};

const SETTINGS_TEMPLATE_SECTIONS = [
  {
    name: "Jira Connection",
    fields: [
      { name: "Jira Base URL", type: "Single-Line Text" },
      { name: "Service Account Email",
        type: "Single-Line Text" },
      { name: "API Token (Encrypted)",
        type: "Multi-Line Text" }
    ]
  },
  {
    name: "Defaults for New Issues",
    fields: [
      { name: "Project Key", type: "Single-Line Text" },
      { name: "Default Issue Type",
        type: "Single-Line Text" },
      { name: "Default Labels", type: "Multi-Line Text" },
      { name: "Target Board ID", type: "Single-Line Text" }
    ]
  },
  {
    name: "Admins",
    fields: [
      { name: "Admin Emails", type: "Multi-Line Text" }
    ]
  }
];

const BUG_REPORT_TEMPLATE_SECTIONS = [
  {
    name: "Jira",
    fields: [
      { name: "Ticket Key", type: "Single-Line Text" },
      { name: "Ticket URL", type: "Single-Line Text" },
      { name: "Summary", type: "Single-Line Text" },
      { name: "Issue Type", type: "Single-Line Text" }
    ]
  },
  {
    name: "Tracking",
    fields: [
      { name: "Page Item ID", type: "Single-Line Text" },
      { name: "Page Path", type: "Single-Line Text" },
      { name: "Page Title", type: "Single-Line Text" },
      { name: "Rendering Instance ID",
        type: "Single-Line Text" },
      { name: "Rendering Name", type: "Single-Line Text" },
      { name: "Data Source Item ID",
        type: "Single-Line Text" }
    ]
  },
  {
    name: "Audit",
    fields: [
      { name: "Reporter", type: "Single-Line Text" },
      { name: "Created At", type: "Datetime" }
    ]
  }
];

export type TemplateProvisionArgs = {
  client: XmcClient;
};

function stripBraces(id: string): string {
  return id.replace(/[{}]/g, "");
}

export async function ensureFeatureTemplates(
  args: TemplateProvisionArgs
): Promise<ResolvedTemplateIds> {
  const { client } = args;

  // 1. Short-circuit: if both templates already exist, read
  // their ids out of itemByPath and return without mutating.
  const existingSettings =
    await client.itemByPath(SETTINGS_TEMPLATE_PATH);
  const existingBugReport =
    await client.itemByPath(BUG_REPORT_TEMPLATE_PATH);
  if (existingSettings && existingBugReport) {
    return {
      settingsTemplateId: `{${stripBraces(existingSettings.itemId)}}`,
      bugReportTemplateId: `{${stripBraces(existingBugReport.itemId)}}`
    };
  }

  // 2. Ensure the /Feature/BugReporterJira folder exists.
  const folder =
    await client.itemByPath(PLUGIN_TEMPLATES_FOLDER);
  if (!folder) {
    const featureRoot =
      await client.itemByPath(FEATURE_TEMPLATES_ROOT);
    if (!featureRoot) {
      throw new Error(
        `${FEATURE_TEMPLATES_ROOT} not found — your XMC ` +
        `instance is missing the standard Feature ` +
        `template folder. Create it before running ` +
        `template provisioning.`
      );
    }
    await client.createItem({
      name: "BugReporterJira",
      parent: FEATURE_TEMPLATES_ROOT,
      templateId: TEMPLATE_FOLDER_TEMPLATE_ID,
      language: "en",
      fields: []
    });
  }

  // 3. Create either template if missing via the public
  // graphql escape hatch on XmcClient.
  const settingsId = existingSettings
    ? `{${stripBraces(existingSettings.itemId)}}`
    : await createTemplate(client, {
        name: "BugReporterJiraSettings",
        parent: PLUGIN_TEMPLATES_FOLDER,
        sections: SETTINGS_TEMPLATE_SECTIONS
      });

  const bugReportId = existingBugReport
    ? `{${stripBraces(existingBugReport.itemId)}}`
    : await createTemplate(client, {
        name: "BugReport",
        parent: PLUGIN_TEMPLATES_FOLDER,
        sections: BUG_REPORT_TEMPLATE_SECTIONS
      });

  return {
    settingsTemplateId: settingsId,
    bugReportTemplateId: bugReportId
  };
}

async function createTemplate(
  client: XmcClient,
  input: {
    name: string;
    parent: string;
    sections: typeof SETTINGS_TEMPLATE_SECTIONS;
  }
): Promise<string> {
  const data = await client.graphql<CreateTemplateResponse>(
    CREATE_TEMPLATE_MUTATION, { input }
  );
  const id = data.createItemTemplate.itemTemplate.templateId;
  return `{${stripBraces(id)}}`;
}

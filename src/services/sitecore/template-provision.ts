// Ensures the plugin's Feature templates exist in Sitecore,
// creating them via Authoring GraphQL if absent. Returns
// stable template IDs that provisioning and the stores use.
//
// This removes the "author the templates in Sitecore first"
// prerequisite from the install flow. Templates are
// idempotent: existing templates are detected by path and
// reused without modification.

import type { XmcClient } from "./xmc";
import { stripBraces } from "./utils";

export const FEATURE_TEMPLATES_ROOT =
  "/sitecore/templates/Feature";

export const PLUGIN_TEMPLATES_FOLDER =
  "/sitecore/templates/Feature/BugReporterJira";

export const SETTINGS_TEMPLATE_PATH =
  `${PLUGIN_TEMPLATES_FOLDER}/BugReporterJiraSettings`;

export const BUG_REPORT_TEMPLATE_PATH =
  `${PLUGIN_TEMPLATES_FOLDER}/BugReport`;

export const BUCKETABLE_FOLDER_TEMPLATE_PATH =
  `${PLUGIN_TEMPLATES_FOLDER}/Bucketable Folder`;

export const TEMPLATE_FOLDER_TEMPLATE_ID =
  "{0437FEE2-44C9-46A6-ABE9-28858D9FEE8C}";

// Standard Sitecore Office icon for anything this plugin
// owns in the content tree — templates, folders, the
// config item, and the bug-reports bucket. Picked for
// Content-Editor recognisability; the browser-side UI uses
// MDI's ladybug glyph instead.
export const PLUGIN_BUG_ICON = "Office/32x32/bug.png";

export type ResolvedTemplateIds = {
  settingsTemplateId: string;
  bugReportTemplateId: string;
  bucketableFolderTemplateId: string;
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
      { name: "API Token Encrypted",
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

export async function ensureFeatureTemplates(
  args: TemplateProvisionArgs
): Promise<ResolvedTemplateIds> {
  const { client } = args;

  // 1. Short-circuit: if both templates already exist, read
  // their ids out of itemByPath and return without mutating.
  const [existingSettings, existingBugReport, existingBucketable] =
    await Promise.all([
      client.itemByPath(SETTINGS_TEMPLATE_PATH),
      client.itemByPath(BUG_REPORT_TEMPLATE_PATH),
      client.itemByPath(BUCKETABLE_FOLDER_TEMPLATE_PATH)
    ]);
  if (existingSettings && existingBugReport && existingBucketable) {
    return {
      settingsTemplateId: `{${stripBraces(existingSettings.itemId)}}`,
      bugReportTemplateId: `{${stripBraces(existingBugReport.itemId)}}`,
      bucketableFolderTemplateId: `{${stripBraces(existingBucketable.itemId)}}`
    };
  }

  // 2. Ensure the /Feature/BugReporterJira folder exists.
  // We don't preflight the /sitecore/templates/Feature
  // parent — the Authoring API's `item(where: { path })`
  // query can return null for template-folder items that
  // lack language versions, producing false negatives on
  // stock Sitecore paths. If the parent is genuinely
  // missing, `createItem` returns a clear GraphQL error
  // that propagates through the UI.
  const folder =
    await client.itemByPath(PLUGIN_TEMPLATES_FOLDER);
  if (!folder) {
    try {
      await client.createItem({
        name: "BugReporterJira",
        parent: FEATURE_TEMPLATES_ROOT,
        templateId: TEMPLATE_FOLDER_TEMPLATE_ID,
        language: "en",
        fields: []
      });
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (/not.*found|does not exist|invalid parent/i
            .test(msg)) {
        throw new Error(
          `Could not create ${PLUGIN_TEMPLATES_FOLDER}. ` +
          `Verify ${FEATURE_TEMPLATES_ROOT} exists and ` +
          `the plugin's Marketplace app has permission ` +
          `to create template items. Upstream: ${msg}`
        );
      }
      throw e;
    }
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

  const bucketableId = existingBucketable
    ? `{${stripBraces(existingBucketable.itemId)}}`
    : await createTemplate(client, {
        name: "Bucketable Folder",
        parent: PLUGIN_TEMPLATES_FOLDER,
        sections: []
      });

  return {
    settingsTemplateId: settingsId,
    bugReportTemplateId: bugReportId,
    bucketableFolderTemplateId: bucketableId
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
  // XMC Authoring's CreateItemTemplateInput.parent is a
  // Guid, not a path. Resolve the parent folder to its
  // item id first, then send the Guid in the mutation.
  // Otherwise the API responds with
  // "Unable to convert type from String to Guid".
  const parentItem = await client.itemByPath(input.parent);
  if (!parentItem) {
    throw new Error(
      `createItemTemplate: parent template folder ` +
      `${input.parent} not found — run the folder step ` +
      `first or check Marketplace-app permissions.`
    );
  }
  const data = await client.graphql<CreateTemplateResponse>(
    CREATE_TEMPLATE_MUTATION,
    { input: {
        name: input.name,
        parent: stripBraces(parentItem.itemId),
        icon: PLUGIN_BUG_ICON,
        sections: input.sections
    } }
  );
  const id = data.createItemTemplate.itemTemplate.templateId;
  return `{${stripBraces(id)}}`;
}

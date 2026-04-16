import type { XmcClient } from "@/services/sitecore/xmc";
import {
  TEMPLATE_ID_FOLDER,
  TEMPLATE_ID_BUG_REPORTER_SETTINGS,
  settingsFolderPath, settingsConfigPath,
  bugReportsRootPath
} from "@/services/sitecore/templates";
import {
  ensureFeatureTemplates
} from "@/services/sitecore/template-provision";

export type ProvisionArgs = {
  client: XmcClient;
  tenant: string;
  site: string;
  language?: string;
  // When true (default), ensureFeatureTemplates runs first so
  // the plugin boots its own template tree under
  // /sitecore/templates/Feature/BugReporterJira. Set false
  // if templates are deployed via SCS and the template ids
  // are already populated in env (SITECORE_TEMPLATE_*).
  ensureTemplates?: boolean;
};

export type ProvisionResult = {
  settingsTemplateId: string;
  bugReportTemplateId: string;
};

export async function provisionPluginSite(
  args: ProvisionArgs
): Promise<ProvisionResult> {
  const { client, tenant, site } = args;
  const language = args.language ?? "en";
  const shouldEnsureTemplates = args.ensureTemplates ?? true;

  const templateIds = shouldEnsureTemplates
    ? await ensureFeatureTemplates({ client })
    : {
        settingsTemplateId: TEMPLATE_ID_BUG_REPORTER_SETTINGS,
        bugReportTemplateId:
          TEMPLATE_ID_BUG_REPORTER_SETTINGS // fallback only
      };

  const siteRoot =
    `/sitecore/content/${tenant}/${site}`;
  const siteRootItem =
    await client.itemByPath(siteRoot, language);
  if (!siteRootItem) {
    throw new Error(
      `${siteRoot} not found — the site tree must exist ` +
      `before the plugin can bootstrap itself. Create the ` +
      `site in Sitecore XM Cloud first.`
    );
  }

  // Auto-create the site's Settings and Data roots if they
  // are missing. SXA sites have these by default, but a
  // vanilla Sitecore site may not — the plugin creates them
  // so no manual authoring is required before install.
  const settingsRoot = `${siteRoot}/Settings`;
  const settingsRootItem =
    await client.itemByPath(settingsRoot, language);
  if (!settingsRootItem) {
    await client.createItem({
      name: "Settings",
      parent: siteRoot,
      templateId: TEMPLATE_ID_FOLDER,
      language,
      fields: []
    });
  }
  const dataRoot = `${siteRoot}/Data`;
  const dataRootItem =
    await client.itemByPath(dataRoot, language);
  if (!dataRootItem) {
    await client.createItem({
      name: "Data",
      parent: siteRoot,
      templateId: TEMPLATE_ID_FOLDER,
      language,
      fields: []
    });
  }

  // 1. Ensure the "Bug Reporter for Jira" folder.
  const folderPath = settingsFolderPath(tenant, site);
  const existingFolder =
    await client.itemByPath(folderPath, language);
  if (!existingFolder) {
    await client.createItem({
      name: "Bug Reporter for Jira",
      parent: settingsRoot,
      templateId: TEMPLATE_ID_FOLDER,
      language,
      fields: []
    });
  }

  // 2. Ensure the Config item using the resolved template id.
  const configPath = settingsConfigPath(tenant, site);
  const existingConfig =
    await client.itemByPath(configPath, language);
  if (!existingConfig) {
    await client.createItem({
      name: "Config",
      parent: folderPath,
      templateId: templateIds.settingsTemplateId,
      language,
      fields: []
    });
  }

  // 3. Ensure the Data/Bug Reports bucket.
  const reportsPath = bugReportsRootPath(tenant, site);
  const existingReports =
    await client.itemByPath(reportsPath, language);
  if (!existingReports) {
    const created = await client.createItem({
      name: "Bug Reports",
      parent: dataRoot,
      templateId: TEMPLATE_ID_FOLDER,
      language,
      fields: []
    });
    // Flip the item-bucket flag so child BugReport items get
    // auto-distributed into yyyy/MM/dd buckets. This is a
    // best-effort update — if the editor's role can't set
    // __Bucket, the plugin still works (ticket records just
    // accumulate as flat children until an admin enables
    // the bucket manually).
    try {
      await client.updateItem({
        itemId: created.itemId,
        language,
        fields: [{ name: "__Bucket", value: "1" }]
      });
    } catch {
      /* non-fatal — see docs/ops/bucket-setup.md */
    }
  }

  return templateIds;
}

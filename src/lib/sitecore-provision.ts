import type { XmcClient } from "@/services/sitecore/xmc";
import {
  TEMPLATE_ID_FOLDER,
  TEMPLATE_ID_BUG_REPORTER_SETTINGS,
  TEMPLATE_ID_BUCKETABLE_FOLDER,
  settingsFolderPath, settingsConfigPath,
  bugReportsRootPath
} from "@/services/sitecore/templates";
import {
  ensureFeatureTemplates, PLUGIN_BUG_ICON
} from "@/services/sitecore/template-provision";

// __Icon is Sitecore's "override the template's icon on
// this specific item" field. Setting it on the folders,
// Config, and the Bug Reports bucket makes the plugin
// instantly findable in Content Editor.
const ICON_FIELD = { name: "__Icon", value: PLUGIN_BUG_ICON };

type ProvisionArgs = {
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

type ProvisionResult = {
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
          TEMPLATE_ID_BUG_REPORTER_SETTINGS, // fallback only
        bucketableFolderTemplateId:
          TEMPLATE_ID_BUCKETABLE_FOLDER
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
  const dataRoot = `${siteRoot}/Data`;
  const folderPath = settingsFolderPath(tenant, site);
  const configPath = settingsConfigPath(tenant, site);
  const reportsPath = bugReportsRootPath(tenant, site);

  const [
    settingsRootItem,
    dataRootItem,
    existingFolder,
    existingConfig,
    existingReports
  ] = await Promise.all([
    client.itemByPath(settingsRoot, language),
    client.itemByPath(dataRoot, language),
    client.itemByPath(folderPath, language),
    client.itemByPath(configPath, language),
    client.itemByPath(reportsPath, language)
  ]);

  if (!settingsRootItem) {
    await client.createItem({
      name: "Settings",
      parent: siteRoot,
      templateId: TEMPLATE_ID_FOLDER,
      language,
      fields: []
    });
  }
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
  if (!existingFolder) {
    await client.createItem({
      name: "Bug Reporter for Jira",
      parent: settingsRoot,
      templateId: TEMPLATE_ID_FOLDER,
      language,
      fields: [ICON_FIELD]
    });
  }

  // 2. Ensure the Config item using the resolved template id.
  if (!existingConfig) {
    await client.createItem({
      name: "Config",
      parent: folderPath,
      templateId: templateIds.settingsTemplateId,
      language,
      fields: [ICON_FIELD]
    });
  }

  // 3. Ensure the Data/Bug Reports folder using a bucketable
  // folder template, then flip `__Is Bucket` on the newly
  // created item. This mirrors the Configure → Bucket toggle
  // in Content Editor. `__Is Bucket` comes from the inherited
  // "Item Buckets" section (id {AF530C7B-8B87-458B-80CE-239D1E1B9E60});
  // the field name carries the `__` prefix and a space, not
  // `IsBucket` — XMC's Authoring API rejects the unprefixed
  // form with "Cannot find a field with the name IsBucket".
  if (!existingReports) {
    const reportsItem = await client.createItem({
      name: "Bug Reports",
      parent: dataRoot,
      templateId: templateIds.bucketableFolderTemplateId
        ?? TEMPLATE_ID_BUCKETABLE_FOLDER,
      language,
      fields: [ICON_FIELD]
    });

    await client.updateItem({
      itemId: reportsItem.itemId,
      language,
      fields: [{ name: "__Is Bucket", value: "1" }]
    });
  }

  return templateIds;
}

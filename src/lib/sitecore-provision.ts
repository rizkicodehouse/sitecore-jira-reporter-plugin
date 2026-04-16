import type { XmcClient } from "@/services/sitecore/xmc";
import {
  TEMPLATE_ID_FOLDER,
  TEMPLATE_ID_BUG_REPORTER_SETTINGS,
  settingsFolderPath, settingsConfigPath,
  bugReportsRootPath
} from "@/services/sitecore/templates";

export type ProvisionArgs = {
  client: XmcClient;
  tenant: string;
  site: string;
  language?: string;
};

export async function provisionPluginSite(
  args: ProvisionArgs
): Promise<void> {
  const { client, tenant, site } = args;
  const language = args.language ?? "en";

  const settingsRoot =
    `/sitecore/content/${tenant}/${site}/Settings`;
  const dataRoot =
    `/sitecore/content/${tenant}/${site}/Data`;
  const settingsRootItem =
    await client.itemByPath(settingsRoot, language);
  if (!settingsRootItem) {
    throw new Error(
      `${settingsRoot} not found — site tree is missing ` +
      `its Settings folder. Create it in Sitecore first.`
    );
  }
  const dataRootItem =
    await client.itemByPath(dataRoot, language);
  if (!dataRootItem) {
    throw new Error(
      `${dataRoot} not found — site tree is missing ` +
      `its Data folder. Create it in Sitecore first.`
    );
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

  // 2. Ensure the Config item.
  const configPath = settingsConfigPath(tenant, site);
  const existingConfig =
    await client.itemByPath(configPath, language);
  if (!existingConfig) {
    await client.createItem({
      name: "Config",
      parent: folderPath,
      templateId: TEMPLATE_ID_BUG_REPORTER_SETTINGS,
      language,
      fields: []
    });
  }

  // 3. Ensure the Data/Bug Reports bucket.
  const reportsPath = bugReportsRootPath(tenant, site);
  const existingReports =
    await client.itemByPath(reportsPath, language);
  if (!existingReports) {
    await client.createItem({
      name: "Bug Reports",
      parent: dataRoot,
      templateId: TEMPLATE_ID_FOLDER,
      language,
      fields: []
    });
    // NOTE: Marking the item as a bucket is a dedicated
    // authoring action (setting the __Bucketable flag +
    // child-items rule). The provisioning UI surfaces a
    // follow-up instruction if the editor's role can't
    // toggle it — see docs/ops/bucket-setup.md.
  }
}

// Pure types + defaults for the plugin's settings record.
// Isolated from `settings-store.ts` (which imports node:crypto
// for server-side encrypt/decrypt) so browser code can import
// these safely without dragging the crypto module into the
// client bundle.

import { z } from "zod";

export const PublicSettingsSchema = z.object({
  projectKey: z.string().min(1),
  defaultIssueType: z.string().min(1),
  defaultLabels: z.array(z.string()),
  defaultBoardId: z.number().int().positive().nullable(),
  jiraBaseUrl: z.string(),
  jiraServiceEmail: z.string(),
  hasJiraApiToken: z.boolean(),
  adminEmails: z.array(z.string())
});
export type PublicSettings = z.infer<
  typeof PublicSettingsSchema
>;

export const SettingsUpdateSchema = z.object({
  projectKey: z.string().min(1),
  defaultIssueType: z.string().min(1),
  defaultLabels: z.array(z.string()),
  defaultBoardId: z.number().int().positive().nullable(),
  jiraBaseUrl: z.string().url().or(z.literal("")),
  jiraServiceEmail: z.string(),
  jiraApiToken: z.string().optional(),
  adminEmails: z.array(z.string())
});
export type SettingsUpdate = z.infer<
  typeof SettingsUpdateSchema
>;

export type StoredSettings = Omit<
  SettingsUpdate, "jiraApiToken"
> & { jiraApiTokenEnc: string | null };

export const DEFAULT_SETTINGS: StoredSettings = {
  projectKey: "",
  defaultIssueType: "Bug",
  defaultLabels: ["page-builder"],
  defaultBoardId: null,
  jiraBaseUrl: "",
  jiraServiceEmail: "",
  jiraApiTokenEnc: null,
  adminEmails: []
};

import { basicAuthHeader } from "./jira-creds";

export type NormalizedFieldType =
  | "string"
  | "paragraph"
  | "number"
  | "option"
  | "array-string"
  | "array-option"
  | "priority"
  | "user"
  | "date"
  | "datetime"
  | "unsupported";

export type NormalizedField = {
  key: string;
  name: string;
  required: boolean;
  type: NormalizedFieldType;
  schemaType?: string;
  schemaItems?: string;
  allowedValues?: Array<{
    id?: string;
    name?: string;
    value?: string;
  }>;
  hasDefaultValue?: boolean;
};

type RawField = {
  name?: string;
  required?: boolean;
  hasDefaultValue?: boolean;
  schema?: {
    type?: string;
    items?: string;
    system?: string;
    custom?: string;
  };
  allowedValues?: Array<{
    id?: string;
    name?: string;
    value?: string;
  }>;
};

const PARAGRAPH_HINT = new Set([
  "customfield_steps",
  "customfield_behaviour",
  "customfield_description"
]);

export async function fetchCreateMetaFields(
  baseUrl: string,
  serviceEmail: string,
  apiToken: string,
  projectKey: string,
  issueTypeName: string
): Promise<NormalizedField[]> {
  const url =
    `${baseUrl}/rest/api/3/issue/createmeta?` +
    `projectKeys=${encodeURIComponent(projectKey)}` +
    `&issuetypeNames=${encodeURIComponent(issueTypeName)}` +
    `&expand=projects.issuetypes.fields`;
  const res = await fetch(url, {
    headers: {
      Authorization: basicAuthHeader(
        serviceEmail, apiToken
      ),
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    throw new Error(
      `JIRA createmeta HTTP ${res.status}`
    );
  }
  const body = await res.json() as {
    projects?: Array<{
      key?: string;
      issuetypes?: Array<{
        name?: string;
        fields?: Record<string, RawField>;
      }>;
    }>;
  };
  const project = body.projects?.[0];
  const issueType = project?.issuetypes?.[0];
  const rawFields = issueType?.fields ?? {};
  return Object.entries(rawFields).map(
    ([key, raw]) => normalizeField(key, raw)
  );
}

function normalizeField(
  key: string, raw: RawField
): NormalizedField {
  const schema = raw.schema ?? {};
  const schemaType = schema.type ?? "";
  const schemaItems = schema.items ?? "";
  let type: NormalizedFieldType = "unsupported";
  if (schemaType === "string") {
    type = isParagraphField(key, raw) ? "paragraph" : "string";
  } else if (schemaType === "number") {
    type = "number";
  } else if (schemaType === "option") {
    type = "option";
  } else if (schemaType === "priority") {
    type = "priority";
  } else if (schemaType === "user") {
    type = "user";
  } else if (schemaType === "date") {
    type = "date";
  } else if (schemaType === "datetime") {
    type = "datetime";
  } else if (schemaType === "array") {
    if (schemaItems === "option" ||
        schemaItems === "version" ||
        schemaItems === "component") {
      type = "array-option";
    } else if (schemaItems === "string") {
      type = "array-string";
    }
  }
  return {
    key,
    name: raw.name ?? key,
    required: Boolean(raw.required),
    type,
    schemaType,
    schemaItems,
    allowedValues: raw.allowedValues,
    hasDefaultValue: raw.hasDefaultValue
  };
}

function isParagraphField(
  key: string, raw: RawField
): boolean {
  if (raw.schema?.system === "description") return true;
  const name = (raw.name ?? "").toLowerCase();
  if (name.includes("description")) return true;
  if (name.includes("steps to reproduce")) return true;
  if (name.includes("behaviour") ||
      name.includes("behavior")) return true;
  if (name.includes("reproduction")) return true;
  if (PARAGRAPH_HINT.has(key.toLowerCase())) return true;
  return false;
}

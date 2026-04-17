// XMC Authoring's ID scalar parses as a GUID and rejects
// Sitecore's braced form (e.g. "{A87A00B1-...}") with
// "Unable to convert type from String to Guid". Template
// constants include braces because the REST/SIF conventions
// keep them, so strip before every mutation.
export function stripBraces(id: string): string {
  return id.replace(/^\{|\}$/g, "");
}

export function fieldsToMap(
  nodes: Array<{ name: string; value: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of nodes ?? []) out[n.name] = n.value;
  return out;
}

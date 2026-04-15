export type AdfNode = {
  type: string;
  version?: number;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
};

export const text = (t: string): AdfNode =>
  ({ type: "text", text: t });

export const para = (t: string): AdfNode =>
  ({ type: "paragraph", content: [text(t)] });

export const h2 = (t: string): AdfNode => ({
  type: "heading",
  attrs: { level: 2 },
  content: [text(t)]
});

export const bullet = (items: string[]): AdfNode => ({
  type: "bulletList",
  content: items.map((t) => ({
    type: "listItem",
    content: [para(t)]
  }))
});

export const codeBlock = (
  language: string, body: string
): AdfNode => ({
  type: "codeBlock",
  attrs: { language },
  content: [text(body)]
});

export const doc = (content: AdfNode[]): AdfNode =>
  ({ type: "doc", version: 1, content });

const MAX_FIELD = 500;
const clip = (s: string) =>
  s.length > MAX_FIELD ? s.slice(0, MAX_FIELD) : s;

export type DescriptionInput = {
  description: string;
  reporter: { name: string; email: string } | null;
  page: {
    title: string; url: string;
    language: string; site: string;
  } | null;
  rendering: {
    name?: string;
    template?: string;
    templateName?: string;
    instanceId: string;
    renderingId?: string;
    placeholderKey?: string;
    dataSource?: string;
  } | null;
  datasource: {
    fields: Record<string, string>;
  } | null;
  browser: {
    userAgent: string; viewport: string; timestamp: string;
  };
};

export function buildDescription(
  input: DescriptionInput
): AdfNode {
  const sections: AdfNode[] = [];
  sections.push(h2("Description"));
  sections.push(para(
    input.description || "No description provided."
  ));
  sections.push(h2("Reporter"));
  sections.push(para(
    input.reporter
      ? `${input.reporter.name} — ${input.reporter.email}`
      : "(unavailable)"
  ));
  sections.push(h2("Page"));
  sections.push(para(
    input.page
      ? [input.page.title, input.page.url,
         input.page.language, input.page.site].join(" · ")
      : "(unavailable)"
  ));
  sections.push(h2("Rendering"));
  sections.push(para(
    input.rendering
      ? [
          input.rendering.name ||
            input.rendering.dataSource ||
            input.rendering.renderingId || "(unnamed)",
          input.rendering.template
            ?? input.rendering.templateName ?? "",
          `instance: ${input.rendering.instanceId}`,
          input.rendering.placeholderKey
            ? `placeholder: ${input.rendering.placeholderKey}`
            : ""
        ].filter(Boolean).join(" · ")
      : "(page-level or unavailable)"
  ));
  sections.push(h2("Datasource fields"));
  if (input.datasource &&
      Object.keys(input.datasource.fields).length > 0) {
    sections.push(bullet(
      Object.entries(input.datasource.fields)
        .map(([k, v]) => `${k}: ${clip(String(v))}`)
    ));
  } else {
    sections.push(para("(unavailable)"));
  }
  sections.push(h2("Browser"));
  sections.push(para(
    [input.browser.userAgent, input.browser.viewport,
     input.browser.timestamp].join(" · ")
  ));
  return doc(sections);
}

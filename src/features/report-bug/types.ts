// src/features/report-bug/types.ts
export type RenderingMeta = {
  instanceId: string;
  renderingId: string;
  name: string;
  templateName: string;
  placeholderKey?: string;
  dataSource?: string;
};

export type ReportContext = {
  page: {
    id: string; title: string;
    url: string; language: string; site: string;
  } | null;
  rendering: RenderingMeta | null;
  renderings: RenderingMeta[];
  datasource: {
    itemId: string; templateName: string;
    fields: Record<string, string>;
  } | null;
  reporter: { name: string; email: string } | null;
  browser: {
    userAgent: string; viewport: string; timestamp: string;
  };
};

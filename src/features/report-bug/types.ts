// src/features/report-bug/types.ts
export type ReportContext = {
  page: {
    id: string; title: string;
    url: string; language: string; site: string;
  } | null;
  rendering: {
    instanceId: string; renderingId: string;
    name: string; templateName: string;
  } | null;
  datasource: {
    itemId: string; templateName: string;
    fields: Record<string, string>;
  } | null;
  reporter: { name: string; email: string } | null;
  browser: {
    userAgent: string; viewport: string; timestamp: string;
  };
};

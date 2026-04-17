export type ReportRow = {
  jiraKey: string;
  jiraUrl: string;
  summary: string;
  issueType: string;
  reporter: { email: string; name: string } | null;
  page: {
    title: string;
    url: string;
    language: string;
    site: string;
  } | null;
  rendering: {
    instanceId: string;
    renderingId?: string;
    name?: string;
    templateName?: string;
    placeholderKey?: string;
  } | null;
  datasourceId: string | null;
  createdAt: string;
};

export type ReportsPage = {
  items: ReportRow[];
  total: number;
  offset: number;
  limit: number;
};

export type LoadReports = (params: {
  offset: number;
  limit: number;
}) => Promise<ReportsPage>;

# Manual smoke checklist

Run once per release in a dev Sitecore tenant (~10 min).

1. [ ] Plugin installs via Developer Studio; appears in the
   Pages Context Panel.
2. [ ] Report button disabled until a rendering is selected;
   enables on selection.
3. [ ] Submit creates an issue in the target JIRA project
   with every ADF section populated (Description, Reporter,
   Page, Rendering, Datasource fields, Browser).
4. [ ] Settings gear is visible; non-admin email sees 403 on
   save; admin email saves successfully.
5. [ ] `GET /api/health` returns `{ ok: true,
   jiraConfigured: true, settingsLoaded: true }`.
